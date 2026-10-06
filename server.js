import express from "express";
import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);
const supabasePublic = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

app.use("/api/stripe/webhook", express.raw({type:"application/json"}));
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname, "public")));

async function authUser(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({error:"Missing access token"});
  const {data, error} = await supabasePublic.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({error:"Invalid session"});
  req.user = data.user;
  next();
}

async function adminOnly(req,res,next){
  const email = (req.user.email || "").toLowerCase();
  if (!process.env.ADMIN_EMAIL || email !== process.env.ADMIN_EMAIL.toLowerCase())
    return res.status(403).json({error:"Admin access required"});
  next();
}

app.get("/api/me", authUser, async (req,res)=>{
  const {data, error}=await supabaseAdmin.from("profiles").select("*").eq("id",req.user.id).maybeSingle();
  if(error) return res.status(500).json({error:error.message});
  res.json({user:req.user, profile:data});
});

app.post("/api/documents", authUser, async (req,res)=>{
  const {id,title,type,data}=req.body;
  if(!title || !type || !data) return res.status(400).json({error:"title, type and data are required"});
  const payload={user_id:req.user.id,title,type,data,updated_at:new Date().toISOString()};
  const q=id
    ? supabaseAdmin.from("documents").update(payload).eq("id",id).eq("user_id",req.user.id).select().single()
    : supabaseAdmin.from("documents").insert(payload).select().single();
  const {data:doc,error}=await q;
  if(error) return res.status(500).json({error:error.message});
  res.json(doc);
});

app.get("/api/documents", authUser, async (req,res)=>{
  const {data,error}=await supabaseAdmin.from("documents").select("*").eq("user_id",req.user.id).order("updated_at",{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.delete("/api/documents/:id", authUser, async(req,res)=>{
  const {error}=await supabaseAdmin.from("documents").delete().eq("id",req.params.id).eq("user_id",req.user.id);
  if(error) return res.status(500).json({error:error.message});
  res.json({ok:true});
});

app.post("/api/create-checkout", authUser, async(req,res)=>{
  if(!stripe) return res.status(500).json({error:"Stripe is not configured"});
  const {priceId}=req.body;
  const allowed=[process.env.STRIPE_PRO_PRICE_ID,process.env.STRIPE_BUSINESS_PRICE_ID].filter(Boolean);
  if(!allowed.includes(priceId)) return res.status(400).json({error:"Invalid price"});
  const session=await stripe.checkout.sessions.create({
    mode:"subscription",
    line_items:[{price:priceId,quantity:1}],
    success_url:`${req.protocol}://${req.get("host")}/?payment=success`,
    cancel_url:`${req.protocol}://${req.get("host")}/?payment=cancelled`,
    customer_email:req.user.email,
    metadata:{user_id:req.user.id}
  });
  res.json({url:session.url});
});

app.post("/api/stripe/webhook", async(req,res)=>{
  if(!stripe) return res.status(500).send("Stripe not configured");
  let event;
  try{
    event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET);
  }catch(e){ return res.status(400).send(`Webhook Error: ${e.message}`); }

  if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
    const sub=event.data.object;
    const userId=sub.metadata?.user_id;
    if(userId){
      await supabaseAdmin.from("profiles").update({
        subscription_status: sub.status,
        stripe_customer_id: typeof sub.customer==="string"?sub.customer:null,
        stripe_subscription_id: sub.id,
        plan: sub.items?.data?.[0]?.price?.id === process.env.STRIPE_BUSINESS_PRICE_ID ? "business" : "pro"
      }).eq("id",userId);
    }
  }
  res.json({received:true});
});

app.get("/api/admin/stats", authUser, adminOnly, async(req,res)=>{
  const [{count:users},{count:docs}]=await Promise.all([
    supabaseAdmin.from("profiles").select("*",{count:"exact",head:true}),
    supabaseAdmin.from("documents").select("*",{count:"exact",head:true})
  ]);
  res.json({users:users||0,documents:docs||0});
});

app.get("/api/admin/users", authUser, adminOnly, async(req,res)=>{
  const {data,error}=await supabaseAdmin.from("profiles").select("*").order("created_at",{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data);
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(process.env.PORT||3000,()=>console.log(`CV Invoice Studio running on http://localhost:${process.env.PORT||3000}`));
