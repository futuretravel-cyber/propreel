import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.isAuthenticated();

    const { data } = await req.json();
    const { project_id, result_url, original_url, photo_index } = data || {};

    if (!project_id || !result_url) {
      return Response.json({ ok: false, reason: "Missing project_id or result_url" });
    }

    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) return Response.json({ ok: false, reason: "Project not found" });

    const photos = [...(project.photos || [])];

    // Replace the original photo at the known index, or replace by URL match, or append
    if (typeof photo_index === "number" && photo_index >= 0 && photo_index < photos.length) {
      photos[photo_index] = result_url;
    } else if (original_url) {
      const idx = photos.indexOf(original_url);
      if (idx !== -1) {
        photos[idx] = result_url;
      } else {
        photos.push(result_url);
      }
    } else {
      photos.push(result_url);
    }

    // Also update selected_photo_ids if the original was in there
    let selectedIds = [...(project.selected_photo_ids || [])];
    if (original_url && selectedIds.includes(original_url)) {
      selectedIds = selectedIds.map(u => u === original_url ? result_url : u);
    }

    await base44.asServiceRole.entities.Project.update(project_id, {
      photos,
      selected_photo_ids: selectedIds,
    });

    return Response.json({ ok: true, photos_count: photos.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});