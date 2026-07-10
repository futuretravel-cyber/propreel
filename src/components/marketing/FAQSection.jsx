import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  { q: "How long does it take to create a video?", a: "On average, videos take about 10 minutes from upload to download. AI rendering typically completes within 2-5 minutes depending on video length." },
  { q: "Can I create portrait (9:16) videos?", a: "Yes! PropReel SA supports both Landscape (16:9) for YouTube, Facebook, and Property24, and Portrait (9:16) for Instagram Reels and TikTok." },
  { q: "How does the Property24 import work?", a: "Simply paste your Property24 listing URL and we'll automatically import all listing photos. Works with Private Property too." },
  { q: "How many photos can I use per video?", a: "Free plan allows up to 15 photos per video. Growth and Pro plans allow up to 20 photos per video. Each photo becomes approximately a 3-second clip." },
  { q: "How long are the videos?", a: "Video length depends on the number of photos selected. With 10 photos, you'll get roughly a 30-second video. Maximum duration is approximately 60 seconds." },
  { q: "Is there a free trial?", a: "Yes! Our Free plan gives you 2 videos per month at no cost. Growth and Pro plans include a 7-day free trial." },
  { q: "Do I need a credit card to start?", a: "No. You can sign up for the Free plan without a credit card. A payment method is only required for Growth and Pro plans." },
  { q: "How do payments work in ZAR?", a: "All our pricing is in South African Rand. We accept Visa/Mastercard, EFT, Instant EFT, SnapScan, PayFast, PayGate, and Ozow." },
  { q: "What's the maximum file size?", a: "Free plan: 10MB per photo. Growth plan: 15MB per photo. Pro plan: 25MB per photo. We support JPG and PNG formats." },
  { q: "Can I remove the watermark?", a: "The Free plan includes a PropReel watermark. Upgrade to Growth or Pro to remove it completely." },
  { q: "What advantage does this give me over competitors?", a: "Estate agents using video listings receive 403% more enquiries on average. Stand out from other agents in your area with cinematic property reels." },
  { q: "How do I contact support?", a: "Email us at support@propreel.co.za, use our live chat, or visit our contact page. Our team is available Monday-Friday during SAST business hours." },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);
  const half = Math.ceil(faqs.length / 2);
  const col1 = faqs.slice(0, half);
  const col2 = faqs.slice(half);

  const FaqItem = ({ faq, idx }) => (
    <button
      onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
      className="w-full text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-[#21ABB5]/20 transition-all"
    >
      <div className="flex justify-between items-start gap-3">
        <span className="text-sm font-semibold text-[#0F082B]">{faq.q}</span>
        <ChevronDown className={`w-4 h-4 text-[#606060] flex-shrink-0 mt-0.5 transition-transform ${openIndex === idx ? "rotate-180" : ""}`} />
      </div>
      {openIndex === idx && (
        <p className="text-sm text-[#606060] leading-relaxed mt-3 pr-6">{faq.a}</p>
      )}
    </button>
  );

  return (
    <section className="py-20 px-4 bg-[#F8F9FA]" id="faq">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">Frequently Asked Questions</h2>
          <p className="text-lg text-[#606060]">Everything you need to know about PropReel SA</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-3">
            {col1.map((faq, i) => <FaqItem key={i} faq={faq} idx={i} />)}
          </div>
          <div className="flex flex-col gap-3">
            {col2.map((faq, i) => <FaqItem key={i + half} faq={faq} idx={i + half} />)}
          </div>
        </div>
      </div>
    </section>
  );
}