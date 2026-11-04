/// <reference types="vite/client" />

/** ALTCHA proof-of-work widget (custom element registered by the `altcha` package). */
declare namespace JSX {
  interface IntrinsicElements {
    'altcha-widget': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        challenge?: string;
        name?: string;
        auto?: string | boolean;
        display?: string;
        language?: string;
        ref?: React.Ref<HTMLElement>;
      },
      HTMLElement
    >;
  }
}
