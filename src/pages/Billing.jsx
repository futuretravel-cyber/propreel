import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, Zap, Crown, Sparkles, Coins, Loader2, AlertCircle, CreditCard, TrendingUp, ArrowLeft, Building2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { payWithPaystack } from "@/lib/paystack";
import { FREE_SIGNUP_CREDITS } from "@/lib/credits";

const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 12900,
    credits: 130,
    icon: Zap,
    features: ["130 credits / month", "Essential & Social video tiers", "AI Photo Editor", "Property descriptions"],
    accent: "from-slate-600 to-slate-700",
  },
  {
    id: "professional",
    name: "Professional",
    price: 58900,
    credits: 600,
    icon: Sparkles,
    features: ["600 credits / month", "All video tiers including Cinematic", "Virtual Staging & Twilight", "Social media post generation", "Priority queue"],
    accent: "from-indigo-500 to-violet-600",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 127000,
    credits: 1300,
    icon: Crown,
    features: ["1,300 credits / month", "All tiers including Premium HD", "Unlimited brand kits", "Priority support"],
    accent: "from-amber-500 to-orange-500",
  },
  {
    id: "agency",
    name: "Agency",
    price: 500000,
    credits: 5000,
    icon: Building2,
    features: ["5,000 credits / month", "Everything in Premium", "Add unlimited agents", "Shared credit pool", "Agency spending dashboard"],
    accent: "from-emerald-500 to-teal-600",
  },
];

const CREDIT_PRICE_CENTS = 100; // R1.00 per credit
const MIN_CREDITS = 10;
const MAX_CREDITS = 5000;
const CREDIT_STEP = 10;

function formatRand(cents) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState("professional");
  const [creditAmount, setCreditAmount] = useState(50);
  const [paying, setPaying] = useState(null);
  const [currentCredits, setCurrentCredits] = useState(user?.credits ?? 0);

  useEffect(() => {
    base44.auth.me().then(async (u) => {
      if (u.agency_id) {
        try {
          const agency = await base44.entities.Agency.get(u.agency_id);
          setCurrentCredits(agency.credits ?? 0);
        } catch {
          setCurrentCredits(u.credits ?? 0);
        }
      } else {
        setCurrentCredits(u.credits ?? 0);
      }
    }).catch(() => {});
  }, []);

  const creditTotalCents = useMemo(() => creditAmount * CREDIT_PRICE_CENTS, [creditAmount]);

  const handleSubscription = async (plan) => {
    if (!user?.email) {
      toast({ title: "Please log in to subscribe", variant: "destructive" });
      return;
    }
    setPaying("subscription");
    try {
      await payWithPaystack({
        email: user.email,
        amountCents: plan.price,
        currency: "ZAR",
        reference: `sub_${plan.id}_${Date.now()}`,
        onSuccess: async () => {
          // For Agency plan, ensure an agency exists and add credits to the pool
          if (plan.id === "agency") {
            let agencyId = user.agency_id;
            if (!agencyId) {
              const agency = await base44.entities.Agency.create({
                name: `${user.full_name || user.email}'s Agency`,
                credits: 0,
              });
              await base44.auth.updateMe({ agency_id: agency.id, agency_role: "owner" });
              agencyId = agency.id;
            }
            const agency = await base44.entities.Agency.get(agencyId);
            const newPool = (agency.credits || 0) + plan.credits;
            await base44.entities.Agency.update(agencyId, { credits: newPool });
            setCurrentCredits(newPool);
            window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: newPool, source: "agency" } }));
          } else {
            const fresh = await base44.auth.me();
            const newBalance = (fresh.credits ?? 0) + plan.credits;
            await base44.auth.updateMe({ credits: newBalance, subscription_plan: plan.id });
            setCurrentCredits(newBalance);
            window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: newBalance } }));
          }
          toast({ title: `✅ ${plan.name} plan activated!`, description: `${plan.credits.toLocaleString("en-ZA")} credits added.` });
          setPaying(null);
        },
        onClose: () => {
          setPaying(null);
          toast({ title: "Payment window closed", description: "Your subscription was not completed." });
        },
      });
    } catch (e) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
      setPaying(null);
    }
  };

  const handleCreditPurchase = async () => {
    if (!user?.email) {
      toast({ title: "Please log in to purchase credits", variant: "destructive" });
      return;
    }
    setPaying("credits");
    try {
      await payWithPaystack({
        email: user.email,
        amountCents: creditTotalCents,
        currency: "ZAR",
        reference: `credits_${creditAmount}_${Date.now()}`,
        onSuccess: async () => {
          const fresh = await base44.auth.me();
          if (fresh.agency_id) {
            const agency = await base44.entities.Agency.get(fresh.agency_id);
            const newPool = (agency.credits || 0) + creditAmount;
            await base44.entities.Agency.update(fresh.agency_id, { credits: newPool });
            setCurrentCredits(newPool);
            window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: newPool, source: "agency" } }));
          } else {
            const newBalance = (fresh.credits ?? 0) + creditAmount;
            await base44.auth.updateMe({ credits: newBalance });
            setCurrentCredits(newBalance);
            window.dispatchEvent(new CustomEvent("credits:updated", { detail: { credits: newBalance } }));
          }
          toast({ title: `✅ ${creditAmount} credits purchased!`, description: `New balance: ${currentCredits + creditAmount} credits.` });
          setPaying(null);
        },
        onClose: () => {
          setPaying(null);
          toast({ title: "Payment window closed", description: "Your credit purchase was not completed." });
        },
      });
    } catch (e) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
      setPaying(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="p-2 -ml-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Billing & Credits</h1>
          <p className="text-sm text-slate-400 mt-1">Subscribe to a monthly plan or top up credits on demand.</p>
        </div>
      </div>

      {/* Free credits banner */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-200">New here? Get {FREE_SIGNUP_CREDITS} free credits on us!</p>
          <p className="text-xs text-emerald-300/70 mt-0.5">Every new subscriber receives {FREE_SIGNUP_CREDITS} complimentary credits to try PropReel.</p>
        </div>
        {!user && (
          <Link to="/register" className="ml-auto text-xs font-semibold text-emerald-300 hover:text-emerald-200 whitespace-nowrap">
            Sign up →
          </Link>
        )}
      </div>

      {/* Current balance */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-800 rounded-2xl px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{currentCredits.toLocaleString("en-ZA")} credits</p>
            <p className="text-xs text-slate-400 mt-0.5">Current balance · 1 credit = R1 · Photo tools cost 2 credits · Videos cost 5–150 credits</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <CreditCard className="w-4 h-4" /> Powered by <span className="font-bold text-slate-300">Paystack</span>
        </div>
      </div>

      {/* Subscription plans */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Monthly Subscriptions</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const active = selectedPlan === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative bg-slate-900 border rounded-2xl p-5 cursor-pointer transition-all ${
                  active ? "border-indigo-500/50 shadow-lg shadow-indigo-500/10" : "border-slate-800 hover:border-slate-700"
                } ${plan.popular ? "ring-1 ring-indigo-500/30" : ""}`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    MOST POPULAR
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.accent} flex items-center justify-center mb-3 shadow-lg`}>
                  <plan.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <p className="text-2xl font-extrabold text-white mt-1">
                  {formatRand(plan.price)}
                  <span className="text-sm font-normal text-slate-500">/mo</span>
                </p>
                <p className="text-sm text-indigo-400 font-semibold mt-0.5">{plan.credits.toLocaleString("en-ZA")} credits / mo</p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <Check className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscription(plan)}
                  disabled={paying !== null}
                  className={`w-full mt-4 rounded-xl gap-2 h-9 text-xs font-semibold ${
                    active
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25"
                      : "bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {paying === "subscription" && selectedPlan === plan.id ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                  ) : (
                    <>Subscribe</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom credit top-up */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Coins className="w-4 h-4 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Buy Custom Credits</h2>
          <span className="text-xs font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-full">R1 per credit</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-sm text-slate-400 mb-1">Slide to choose your credit amount</p>
              <p className="text-4xl font-extrabold text-white">{creditAmount.toLocaleString("en-ZA")} <span className="text-lg text-slate-500">credits</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400 mb-1">Total price</p>
              <p className="text-3xl font-extrabold text-amber-400">{formatRand(creditTotalCents)}</p>
            </div>
          </div>

          <div className="mb-2">
            <input
              type="range"
              min={MIN_CREDITS}
              max={MAX_CREDITS}
              step={CREDIT_STEP}
              value={creditAmount}
              onChange={(e) => setCreditAmount(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-medium">
              <span>{MIN_CREDITS}</span>
              <span>{MAX_CREDITS / 4}</span>
              <span>{MAX_CREDITS / 2}</span>
              <span>{(MAX_CREDITS / 4) * 3}</span>
              <span>{MAX_CREDITS.toLocaleString("en-ZA")}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {[50, 100, 250, 500, 1000, 5000].map((amt) => (
              <button
                key={amt}
                onClick={() => setCreditAmount(amt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  creditAmount === amt
                    ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {amt.toLocaleString("en-ZA")} · {formatRand(amt * CREDIT_PRICE_CENTS)}
              </button>
            ))}
          </div>

          <Button
            onClick={handleCreditPurchase}
            disabled={paying !== null}
            className="w-full mt-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl gap-2 h-12 shadow-lg shadow-amber-500/25"
          >
            {paying === "credits" ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
            ) : (
              <><Coins className="w-5 h-5" /> Buy {creditAmount.toLocaleString("en-ZA")} Credits for {formatRand(creditTotalCents)}</>
            )}
          </Button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Payments are securely processed by Paystack. Credits are added instantly after successful payment.
          Agency plan subscribers get a shared credit pool — all agents in the agency spend from one balance.
          Need help? <Link to="/contact" className="text-indigo-400 hover:text-indigo-300 font-medium">Contact support</Link>.
        </p>
      </div>
    </div>
  );
}