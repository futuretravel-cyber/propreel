import { useState, useEffect } from "react";
import { loadPromptTemplates } from "@/lib/promptRegistry";

/**
 * React hook that loads the admin-locked prompt template registry on mount
 * and provides a synchronous lookup once loaded.
 *
 * @returns {{ templates: Object, getTemplate: (key) => {prompt, strength}|null, loaded: boolean }}
 */
export function usePromptRegistry() {
  const [templates, setTemplates] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPromptTemplates().then((t) => {
      setTemplates(t);
      setLoaded(true);
    });
  }, []);

  const getTemplate = (key) => templates[key] || null;
  return { templates, getTemplate, loaded };
}