/**
 * The Terms of Service, as data — the single source the /terms page renders
 * from, and the thing the signup consent is versioned against.
 *
 * Every heading, paragraph and list item lives here so the whole document can
 * be flattened into `TERMS_FULL_TEXT` and hashed: `TERMS_CONSENT_VERSION` is
 * an FNV-1a content hash of the exact Terms a person is agreeing to at
 * signup. Edit ANY sentence below and the version changes itself — the next
 * signup records the new hash as `termsConsentVersion` on the user row, and
 * every previously recorded consent is recognisably for older text. Nothing
 * to bump, nothing to remember.
 */

import { AI_DISCLAIMER_TEXT, fnv1a } from './aiDisclaimer';

/** An inline run inside a paragraph or list item: plain text, a link, or bold. */
export type TermsInline = string | { text: string; to?: string; strong?: boolean };

export type TermsBlock =
  | { type: 'p'; parts: TermsInline[] }
  | { type: 'ul'; items: TermsInline[][] }
  /** The purple "Important Notice" callout above section 1 */
  | { type: 'notice'; heading: string; parts: TermsInline[] }
  /** The amber box quoting AI_DISCLAIMER_TEXT verbatim (section 5) */
  | { type: 'aiNotice'; heading: string; text: string }
  /** The contact box closing section 13 */
  | { type: 'contact'; entries: Array<{ icon: 'mail' | 'shield'; label: string; value: string }> };

export interface TermsSection {
  heading: string;
  blocks: TermsBlock[];
}

/** Shown on the page and folded into the hashed text — editing it bumps the
 *  consent version like any other sentence. */
export const TERMS_LAST_UPDATED = 'October 2026';

/** Above section 1 — the "you agree by using this" callout. */
const INTRO_NOTICE: Extract<TermsBlock, { type: 'notice' }> = {
  type: 'notice',
  heading: 'Important Notice',
  parts: [
    "By accessing or using PropReel's services, you agree to be bound by these Terms of Service.",
    'If you do not agree to these terms, please do not use our services.',
  ],
};

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: '1. Acceptance of Terms',
    blocks: [
      {
        type: 'p',
        parts: [
          'These Terms of Service ("Terms") govern your access to and use of PropReel\'s website, applications, and services (collectively, the "Service"). These Terms apply to all users, including agents, agencies, and any other users of the Service.',
        ],
      },
      {
        type: 'p',
        parts: [
          'By creating an account, accessing the Service, or using any PropReel features, you agree to be bound by these Terms and our Privacy Policy. If you are using the Service on behalf of an agency or company, you represent and warrant that you have authority to bind that entity to these Terms.',
        ],
      },
    ],
  },
  {
    heading: '2. Description of Service',
    blocks: [
      { type: 'p', parts: ['PropReel provides AI-powered property marketing tools, including but not limited to:'] },
      {
        type: 'ul',
        items: [
          ['AI-generated property videos from photos'],
          ['AI photo editing and enhancement'],
          ['Virtual staging services'],
          ['Furniture removal from photos'],
          ['Twilight photography conversion'],
          ['Social media caption generation'],
          ['Property description generation'],
        ],
      },
      {
        type: 'p',
        parts: ['The Service is provided on a subscription basis with credit-based usage. Credits are consumed when you use various features of the Service.'],
      },
    ],
  },
  {
    heading: '3. Account Registration',
    blocks: [
      { type: 'p', parts: ['To access certain features, you must create an account. You agree to:'] },
      {
        type: 'ul',
        items: [
          ['Provide accurate, current, and complete information during registration'],
          ['Maintain and promptly update your account information'],
          ['Maintain the security of your password and account'],
          ['Promptly notify us of any unauthorized use of your account'],
          ['Be responsible for all activities that occur under your account'],
        ],
      },
      {
        type: 'p',
        parts: ['You must be at least 18 years old to create an account. You may not create an account for someone else without their express permission.'],
      },
    ],
  },
  {
    heading: '4. Credits and Billing',
    blocks: [
      {
        type: 'p',
        parts: [
          { text: 'Credit System:', strong: true },
          'The Service uses a credit-based system. Different features consume different amounts of credits. Credit costs are displayed before you use any feature.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Subscription Plans:', strong: true },
          'Monthly and annual subscription plans include a set number of credits. Unused subscription credits roll over to the next month but expire at your next renewal date.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Purchased Credits:', strong: true },
          'Credits purchased as top-ups are non-refundable but never expire as long as your account remains active (365 days of inactivity will result in expiry).',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Payment:', strong: true },
          'All payments are processed through Paystack. By subscribing or purchasing credits, you authorize us to charge your payment method for the applicable amounts.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Refunds:', strong: true },
          'Please refer to our',
          { text: 'Refund Policy', to: '/refund-policy' },
          'for detailed information on refunds and cancellations.',
        ],
      },
    ],
  },
  {
    heading: '5. AI-Generated Content',
    blocks: [
      {
        type: 'p',
        parts: [
          { text: 'AI Technology:', strong: true },
          'The Service uses artificial intelligence to generate videos, edit photos, create descriptions, and produce other content. You acknowledge that:',
        ],
      },
      {
        type: 'ul',
        items: [
          ['AI-generated content may not always be perfect or accurate'],
          ['You are responsible for reviewing all AI-generated content before use'],
          ['PropReel does not guarantee specific results from AI features'],
          ['AI may produce variations each time, even with the same inputs'],
          [{ text: 'Credits spent on unsatisfactory results are non-refundable', strong: true }],
        ],
      },
      {
        type: 'aiNotice',
        heading: 'AI-generated content notice — acknowledged before your first render',
        text: AI_DISCLAIMER_TEXT,
      },
      {
        type: 'p',
        parts: [
          { text: 'Ownership:', strong: true },
          'You retain ownership of the photos and property information you upload. AI-generated content created through the Service is licensed to you for your business use.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Accuracy:', strong: true },
          'You are solely responsible for ensuring that all content generated through the Service accurately represents the property and complies with all applicable laws and regulations, including property marketing regulations.',
        ],
      },
    ],
  },
  {
    heading: '6. Acceptable Use',
    blocks: [
      { type: 'p', parts: ['You agree not to use the Service to:'] },
      {
        type: 'ul',
        items: [
          ['Violate any applicable laws or regulations'],
          ['Infringe on intellectual property rights of others'],
          ['Upload content you do not have the right to use'],
          ['Create misleading or deceptive property marketing materials'],
          ['Attempt to reverse engineer or compromise the Service'],
          ['Share your account credentials with unauthorized users'],
          ['Use the Service for any illegal or unauthorized purpose'],
          ['Interfere with or disrupt the Service or servers'],
        ],
      },
      { type: 'p', parts: ['Violation of these terms may result in immediate termination of your account without refund.'] },
    ],
  },
  {
    heading: '7. Intellectual Property',
    blocks: [
      {
        type: 'p',
        parts: [
          { text: 'Your Content:', strong: true },
          'You retain all rights to the photos, property information, and other content you upload to the Service.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'PropReel Content:', strong: true },
          'The Service, including its design, features, and underlying technology, is owned by PropReel and protected by copyright, trademark, and other intellectual property laws.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'License:', strong: true },
          'By using the Service, you grant PropReel a limited license to process your uploaded content solely for the purpose of providing the Service to you.',
        ],
      },
    ],
  },
  {
    heading: '8. Limitation of Liability',
    blocks: [
      {
        type: 'p',
        parts: [
          'TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROPREEL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL.',
        ],
      },
      {
        type: 'p',
        parts: [
          "IN NO EVENT SHALL PROPREEL'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID TO PROPREEL IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.",
        ],
      },
      {
        type: 'p',
        parts: [
          'THIS LIMITATION APPLIES TO ALL CAUSES OF ACTION, INCLUDING BREACH OF CONTRACT, NEGLIGENCE, STRICT LIABILITY, TORT, AND ANY OTHER LEGAL THEORY.',
        ],
      },
    ],
  },
  {
    heading: '9. Disclaimer of Warranties',
    blocks: [
      {
        type: 'p',
        parts: [
          'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
        ],
      },
      {
        type: 'p',
        parts: [
          'PROPREEL DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE SERVICE OR THE SERVERS THAT MAKE IT AVAILABLE ARE FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.',
        ],
      },
    ],
  },
  {
    heading: '10. Termination',
    blocks: [
      {
        type: 'p',
        parts: [
          { text: 'Your Right to Terminate:', strong: true },
          'You may terminate your account at any time by contacting us or using the account deletion feature. Upon termination, your right to use the Service will immediately cease.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Our Right to Terminate:', strong: true },
          'We may terminate or suspend your account immediately, without prior notice, for any conduct that we believe violates these Terms or is harmful to other users, us, or third parties.',
        ],
      },
      {
        type: 'p',
        parts: [
          { text: 'Effect of Termination:', strong: true },
          'Upon termination, all provisions of these Terms which by their nature should survive will remain in effect, including ownership, disclaimers, indemnity, and limitations of liability.',
        ],
      },
    ],
  },
  {
    heading: '11. Governing Law',
    blocks: [
      {
        type: 'p',
        parts: [
          'These Terms shall be governed by and construed in accordance with the laws of the Republic of South Africa, without regard to its conflict of law provisions. Any disputes arising under or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts located in Cape Town, South Africa.',
        ],
      },
    ],
  },
  {
    heading: '12. Changes to Terms',
    blocks: [
      {
        type: 'p',
        parts: [
          'We reserve the right to modify these Terms at any time. We will provide notice of significant changes by email or through the Service. Your continued use of the Service after such modifications constitutes your acceptance of the updated Terms.',
        ],
      },
      {
        type: 'p',
        parts: ['We encourage you to review these Terms periodically to stay informed about our practices.'],
      },
    ],
  },
  {
    heading: '13. Contact Information',
    blocks: [
      { type: 'p', parts: ['If you have any questions about these Terms, please contact us:'] },
      {
        type: 'contact',
        entries: [
          { icon: 'mail', label: 'Email', value: 'legal@propreel.co.za' },
          { icon: 'shield', label: 'Information Officer', value: 'For POPIA-related inquiries' },
        ],
      },
    ],
  },
];

export const TERMS_FOOTER = `© 2026 PropReel. All rights reserved. These Terms of Service are effective as of ${TERMS_LAST_UPDATED}.`;

// ─── The hashed document ────────────────────────────────────────────────────
// The plain-text projection of everything a reader sees on /terms. Whitespace
// matches how the browser collapses it, so the hash tracks the real copy.

function inlineText(part: TermsInline): string {
  return typeof part === 'string' ? part : part.text;
}

function partsText(parts: TermsInline[]): string {
  return parts.map(inlineText).join(' ');
}

function blockText(block: TermsBlock): string[] {
  switch (block.type) {
    case 'p': return [partsText(block.parts)];
    case 'ul': return block.items.map(partsText);
    case 'notice': return [block.heading, partsText(block.parts)];
    case 'aiNotice': return [block.heading, block.text];
    case 'contact': return block.entries.flatMap(e => [e.label, e.value]);
  }
}

/** Everything visible on /terms, flattened. The hash input. */
export const TERMS_FULL_TEXT: string = [
  'Terms of Service',
  `Last updated: ${TERMS_LAST_UPDATED}`,
  INTRO_NOTICE.heading,
  partsText(INTRO_NOTICE.parts),
  ...TERMS_SECTIONS.flatMap(s => [s.heading, ...s.blocks.flatMap(blockText)]),
  TERMS_FOOTER,
].join('\n');

/**
 * The signup consent version: an FNV-1a hash of the exact Terms above.
 * Sent with every registration and stored on the user row as
 * { termsConsentVersion, termsConsentAt }, so the account records precisely
 * which Terms were agreed to and when — and any edit to the copy produces a
 * new version on the next signup.
 */
export const TERMS_CONSENT_VERSION = fnv1a(TERMS_FULL_TEXT);

/** The intro callout, for the page to render above section 1. */
export const TERMS_INTRO_NOTICE = INTRO_NOTICE;
