import { base44 } from "../base44Client.js";

export default async function creatomateWebhook(req, res) {
  const payload = req.body;

  // Creatomate sends an array of render results
  const renders = Array.isArray(payload) ? payload : [payload];

  for (const render of renders) {
    const { id, status, url, metadata } = render;
    if (!id) continue;

    // metadata.project_id is set when we submit the render
    const projectId = metadata?.project_id;
    if (!projectId) continue;

    if (status === "succeeded" && url) {
      await base44.asServiceRole.entities.Project.update(projectId, {
        video_url: url,
        status: "ready",
      });
    } else if (status === "failed") {
      await base44.asServiceRole.entities.Project.update(projectId, {
        status: "draft",
      });
    }
  }

  res.json({ received: true });
}