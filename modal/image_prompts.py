"""
Image Editing Prompts for PropReel Modal Backend
Comprehensive prompt library for AI photo editing, virtual staging, furniture removal, and twilight photography
"""

IMAGE_RENDER_CREDIT_COST = 2

IMAGE_PRESETS = [
    # ═══════════════════════════════════════════════════════════════════════════
    # AI PHOTO EDITOR
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "id": "golden_sunset",
        "label": "Golden Sunset Sky",
        "emoji": "🌅",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, with the sky replaced by a breathtaking golden sunset sky. The sky transitions through rich amber, honey, and warm orange hues near the horizon, softening into gentle gold and blush tones higher up, with soft, naturally lit cloud formations catching the last light of day. Warm, inviting golden-hour light washes across the entire scene, casting soft amber highlights and long gentle shadows on the building's exterior, windows, and surrounding landscaping, as if lit by the setting sun. Keep the property itself — every wall, window, door, roofline, architectural detail, tree, and landscape feature — in its exact original position, shape, and proportion; the house remains the sharp, well-defined focal point against the sunset backdrop. Apply natural, high-end real estate color grading with warm, balanced tones and soft contrast. Shot with a wide-angle real estate lens, sharp focus on the property, hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """altered building structure, moved or added architectural elements, changed windows or doors, warped or slanted walls, curved vertical lines, distorted proportions, fisheye distortion, chromatic aberration, blurry sky, flat or gray sky, harsh midday lighting, blown-out highlights, overexposure, underexposure, harsh shadows, plastic textures, unrealistic reflections, oversaturated neon colors, cold blue tint, cartoonish clouds, fantasy or sci-fi sky, storm clouds, night sky, stars, moon, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo, clutter""",
        "strength": {"min": 0.4, "max": 0.45, "default": 0.42},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "clear_blue_sky",
        "label": "Clear Blue Sky",
        "emoji": "☀️",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, with the sky replaced by a crisp, clear blue sky. The sky is a bright, natural gradient blue, deeper at the top and softening toward a pale horizon, with a few thin, wispy natural clouds for realism. Bright, even, natural daylight illuminates the entire scene, with clean well-defined shadows and true-to-life color. Keep the property — every wall, window, door, roofline, architectural detail, tree, and landscape feature — in its exact original position, shape, and proportion; the house remains the sharp, well-defined focal point against the sky. Apply natural, high-end real estate color grading with balanced, true-to-life tones. Shot with a wide-angle real estate lens, sharp focus, hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped or slanted walls, curved vertical lines, distorted proportions, fisheye distortion, overcast sky, gray sky, storm clouds, dramatic clouds, sunset colors, orange or pink sky tones, hazy or washed-out sky, overexposure, blown-out highlights, harsh shadows, unrealistic reflections, oversaturated colors, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo, clutter""",
        "strength": {"min": 0.4, "max": 0.45, "default": 0.42},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "lush_green_lawn",
        "label": "Lush Green Lawn",
        "emoji": "🌿",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, with the lawn and grass areas transformed into a lush, healthy, vividly green lawn — evenly mowed, dense, and well-maintained, with natural variation in tone and no bald patches or brown spots. Keep every other element of the scene unchanged: the property, its walls, windows, doors, roofline, driveway, trees, shrubs, and hardscaping remain in their exact original position, shape, and color. Natural daylight illuminates the scene evenly. Apply natural, high-end real estate color grading with balanced, true-to-life tones. Shot with a wide-angle real estate lens, sharp focus, hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, changed hardscaping, warped walls, distorted proportions, dead or brown grass, patchy or bald lawn, artificial-looking astroturf texture, oversaturated neon green, unnatural color bleed onto walls or pavement, overexposure, harsh shadows, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.3, "max": 0.35, "default": 0.32},
        "guidanceScale": {"min": 4, "max": 4, "default": 4}
    },
    {
        "id": "brighten_warm",
        "label": "Brighten & Warm",
        "emoji": "💡",
        "category": "photo_editor",
        "prompt": """Professional real estate photograph of this exact room or property, brightened and warmed for an inviting, well-lit appearance. Slightly increase overall exposure so every area is clearly visible and evenly lit, filling dark corners with soft, natural light. Apply a gentle warm color temperature shift — soft honey and cream tones rather than a cold or clinical look. Keep every wall, window, fixture, floor, and piece of furniture in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with soft contrast and balanced whites. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """added or removed objects, moved furniture, altered layout, warped walls, distorted proportions, overexposure, blown-out highlights, underexposure, harsh shadows, dark corners, unnatural orange or yellow cast, oversaturated colors, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.2, "max": 0.3, "default": 0.25},
        "guidanceScale": {"min": 3.5, "max": 4.5, "default": 4}
    },
    {
        "id": "declutter",
        "label": "Declutter & Clean",
        "emoji": "🧹",
        "category": "photo_editor",
        "prompt": """Professional real estate photograph of this exact room, decluttered and cleaned. Remove loose personal items, clutter, stray objects, papers, dishes, cords, and small miscellaneous items from visible surfaces, floors, and countertops. Keep all furniture, fixtures, walls, windows, floors, and architectural elements in their exact original position, shape, and finish — only remove clutter, do not add, replace, or rearrange anything else. Surfaces appear clean, tidy, and freshly presented. Natural, even lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """added objects, added furniture, moved furniture, altered layout, changed wall color, changed flooring, warped walls, distorted proportions, remaining clutter, remaining stray items, dirty or stained surfaces, overexposure, harsh shadows, unrealistic reflections, oversaturated colors, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.35, "max": 0.45, "default": 0.4},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "hdr_boost",
        "label": "HDR Boost",
        "emoji": "🌈",
        "category": "photo_editor",
        "prompt": """Professional real estate photograph of this exact room or property, enhanced with a natural HDR-style dynamic range. Balance highlights and shadows so bright windows and dim interior areas are both clearly detailed and well-exposed, with no blown-out highlights or crushed dark areas. Slightly boost local contrast and color richness for a crisp, vivid, professionally edited look, while keeping tones realistic rather than artificial. Keep every wall, window, fixture, floor, and piece of furniture in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """added or removed objects, moved furniture, altered layout, warped walls, distorted proportions, overexposure, blown-out highlights, underexposure, crushed shadows, halo artifacts, oversaturated neon colors, unnatural glow, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.2, "max": 0.3, "default": 0.25},
        "guidanceScale": {"min": 3.5, "max": 4.5, "default": 4}
    },
    {
        "id": "remove_cars",
        "label": "Remove Cars",
        "emoji": "🚗",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, with any parked or visible cars, trucks, or vehicles removed from the driveway, street, or curb. Fill the space where each vehicle was with the appropriate natural continuation of the driveway, road, lawn, or pavement, matching its existing texture, color, and lighting seamlessly. Keep the property itself — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Natural daylight throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """visible cars, trucks, vehicles, vehicle shadows or reflections, altered building structure, moved architectural elements, warped walls, distorted proportions, mismatched pavement texture, patchy or discolored driveway, visible editing seams, overexposure, harsh shadows, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "crystal_pool",
        "label": "Crystal Pool",
        "emoji": "💧",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, with the pool water transformed into crystal-clear, brilliant turquoise-blue water — clean, inviting, with natural light reflections and gentle ripples on the surface. Keep the pool's shape, size, and edges, along with every other element of the scene — the property, patio, landscaping, and surrounding architecture — in its exact original position, shape, and proportion. Natural daylight illuminates the scene evenly. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """altered pool shape or size, altered building structure, moved architectural elements, warped walls, distorted proportions, murky or green water, dirty or algae-covered water, unnatural neon blue color, artificial-looking water texture, unrealistic reflections, overexposure, harsh shadows, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.3, "max": 0.4, "default": 0.35},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "fresh_white_walls",
        "label": "Fresh White Walls",
        "emoji": "🎨",
        "category": "photo_editor",
        "prompt": """Professional real estate photograph of this exact room, with the walls repainted a clean, fresh white or soft off-white. The new wall color is even, matte, and professionally finished, with natural light and shadow falling realistically across the surface. Keep every window, door, fixture, floor, trim, and piece of furniture in its exact original position, shape, and proportion — only the wall color changes. Apply natural, high-end real estate color grading with balanced whites. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """added or removed objects, moved furniture, altered layout, changed flooring, changed trim color, warped walls, distorted proportions, patchy or uneven paint, visible brush strokes, discoloration, yellow or gray tint, overexposure, harsh shadows, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.3, "max": 0.35, "default": 0.32},
        "guidanceScale": {"min": 4, "max": 4, "default": 4}
    },
    {
        "id": "magic_hour",
        "label": "Magic Hour",
        "emoji": "🌤️",
        "category": "photo_editor",
        "prompt": """Professional real estate exterior photograph of this exact property, captured in the soft, dreamy light of magic hour — the brief period just after sunset or before sunrise. The sky glows with gentle gradients of soft blue, lavender, and warm pink near the horizon. Warm interior lights glow softly through the windows, creating an inviting contrast against the cool ambient dusk light. Soft, diffused, low-contrast natural lighting wraps the entire scene. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, harsh midday lighting, overexposure, blown-out highlights, dark or unlit windows, flat lighting, oversaturated neon colors, cartoonish sky, storm clouds, full nighttime darkness, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.45, "default": 0.42},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "fix_dark_corners",
        "label": "Fix Dark Corners",
        "emoji": "🔆",
        "category": "photo_editor",
        "prompt": """Professional real estate photograph of this exact room, with dark or underexposed corners and shadowed areas brightened to reveal clear detail. Add soft, natural-looking fill light to shadowed regions so the entire room appears evenly and realistically lit, with no area left dim or hard to see. Keep every wall, window, fixture, floor, and piece of furniture in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with balanced exposure throughout. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """added or removed objects, moved furniture, altered layout, warped walls, distorted proportions, remaining dark corners, uneven lighting, overexposure, blown-out highlights, unnatural glow, artificial-looking light sources, oversaturated colors, plastic textures, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.25, "max": 0.3, "default": 0.27},
        "guidanceScale": {"min": 3.5, "max": 4, "default": 3.75}
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # VIRTUAL STAGING
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "id": "luxury_modern",
        "label": "Luxury Modern",
        "emoji": "🛋️",
        "category": "staging",
        "prompt": """Add luxury modern furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: a low-profile tufted sofa in neutral tones, a sculptural glass or marble coffee table, statement lighting fixtures, and tasteful decor accents such as a large abstract art piece and a designer area rug. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Keep the room's existing light sources and natural lighting. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, curved vertical lines, furniture floating above floor, furniture clipping through walls, mismatched scale, oversized or undersized furniture, cluttered arrangement, blocked windows, blocked doorways, low-quality furniture textures, plastic textures, unrealistic shadows, mismatched lighting direction, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "scandinavian_minimal",
        "label": "Scandinavian Minimal",
        "emoji": "🪵",
        "category": "staging",
        "prompt": """Add Scandinavian minimal furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings, sparingly: light natural wood furniture, a simple low sofa or accent chairs in soft neutral fabric, a woven textured rug, minimal clean-lined decor, and one or two potted plants; the palette stays light, airy, and uncluttered, with warm wood tones against white or soft neutral walls. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Bright, soft, natural daylight throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, cluttered or overcrowded room, dark or heavy furniture, ornate or baroque decor, blocked windows, blocked doorways, oversaturated colors, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "coastal_relaxed",
        "label": "Coastal Relaxed",
        "emoji": "🌊",
        "category": "staging",
        "prompt": """Add relaxed coastal furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: light, breezy pieces — a slipcovered sofa in white or soft blue, natural rattan or light wood accent pieces, a jute or woven rug, linen textiles, and subtle nautical-inspired decor such as driftwood accents or soft blue-and-white patterns. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Bright, airy natural daylight throughout. Apply natural, high-end real estate color grading with soft, fresh tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, dark or heavy furniture, cluttered arrangement, blocked windows, blocked doorways, oversaturated or neon colors, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "family_comfortable",
        "label": "Family Comfortable",
        "emoji": "👨‍👩‍👧",
        "category": "staging",
        "prompt": """Add comfortable family living-room furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: an inviting, durable-looking sofa and armchair in warm neutral tones, a sturdy coffee table, a soft area rug, warm accent lighting, and cozy homey decor such as throw pillows and a family-friendly bookshelf or media console — lived-in, welcoming, and practical rather than showroom-formal. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Warm, bright, natural lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, overly formal or cold styling, cluttered or messy arrangement, blocked windows, blocked doorways, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.6, "default": 0.55},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "luxury_bedroom",
        "label": "Luxury Bedroom",
        "emoji": "🛏️",
        "category": "staging",
        "prompt": """Add luxury bedroom furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: a plush upholstered king or queen bed with high-quality layered bedding, matching nightstands with elegant lamps, a tasteful bench or accent chair at the foot of the bed, a soft area rug, and refined decor such as framed art or a decorative mirror. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, closet doors, or walkways. Soft, warm, inviting lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, bed blocking door or closet, cluttered arrangement, mismatched bedding patterns, blocked windows, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "home_office",
        "label": "Home Office",
        "emoji": "💼",
        "category": "staging",
        "prompt": """Add functional, stylish home office furniture to this photo. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: a clean-lined desk, an ergonomic yet elegant office chair, a bookshelf or storage unit, tasteful desk accessories, good task lighting, and subtle decor such as a plant or framed art — professional and inviting rather than sterile. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Bright, natural, productive lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, changed wall material or finish, exposed brick replaced with painted drywall, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed ceiling beams, ductwork, or fixtures, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, cluttered or messy desk, tangled cables, blocked windows, blocked doorways, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "industrial_loft",
        "label": "Industrial Loft",
        "emoji": "⚙️",
        "category": "staging",
        "prompt": """Replace the freestanding furniture in this photo with an industrial-style furniture set, keeping this room exactly as photographed — warm and evenly lit, never dim, dark, or cave-like. This room is already furnished: FIRST remove the existing freestanding furniture and movable decor — tables, chairs, sofas, armchairs, lamps, rugs and loose items — reconstructing the floor beneath them naturally, THEN place the new furniture set. Nothing may remain from the old furnishing. The furniture complements the architectural character that is already there — the room keeps its existing wall colours and materials; the industrial feel comes from the furniture, lighting, and decor only. Keep the room's structure exactly as it is in the input photo — this is a hard geometry constraint, not a style note: no wall may be added, removed, moved, or narrowed; every doorway and opening keeps its exact original position and size — never enlarged, shrunk, or re-shaped; the ceiling keeps its exact original shape, height, and slope, a flat ceiling staying flat; kitchen units, cupboards, cabinets, and appliances keep their exact original size, position, and arrangement; every window, opening, fixture, and built-in feature already visible in the input photo keeps its exact original place, size, and form; every wall keeps its original material, texture, color, and finish unless the style description explicitly calls for a different wall surface. Never add any architectural feature that is not already visible in the input photo. Never redesign, restyle the layout of, or substitute a different room — the output is this exact photo with only the changes described below, never a new rendering of a similar room — and do not change the camera angle, perspective, or lighting. Only add or replace freestanding furniture and soft furnishings: a weathered leather sofa, a reclaimed wood or metal-framed coffee table, black metal accent lighting, an area rug with muted tones, and raw-material decor accents such as metal shelving or exposed-bulb fixtures. Each piece must be sized and placed realistically for the room's actual dimensions, flush on the floor with correct perspective, and must not block windows, doors, or walkways. Brightness matches the original photo: the whole room stays clearly visible with open, readable shadows — industrial styling must never darken the scene. Apply natural, high-end real estate color grading with rich, earthy tones but balanced, bright exposure. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """architectural features not visible in the input photo, added or removed walls, moved or resized walls, enlarged or reshaped doorway, resized or moved cupboards or kitchen units, exposed brick walls added to a room that has none, whole room rebuilt in loft style, changed room layout, altered walls, altered windows, altered doors, altered flooring, altered ceiling, altered exposed brick or beams, changed wall material or finish, repainted or retextured walls, removed staircase, removed mezzanine or loft, removed railings, removed kitchen units or built-in cabinets, removed structural features, changed room layout, changed camera angle or viewpoint, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, overly delicate or ornate furniture, cluttered arrangement, blocked windows, blocked doorways, underexposed room, dark cave-like interior, crushed shadows, dim moody lighting, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.5, "max": 0.6, "default": 0.55},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # FURNITURE REMOVAL
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "id": "remove_all_furniture",
        "label": "Remove All Furniture",
        "emoji": "🗑️",
        "category": "removal",
        "prompt": """Professional real estate interior photograph of this exact room, with all furniture completely removed to show the empty space. Remove sofas, chairs, tables, beds, cabinets, shelving, rugs, lamps, and any other freestanding furniture or movable decor items. Reconstruct the floor, walls, and any areas previously hidden behind furniture with seamless, natural continuation of the existing flooring material, wall finish, and baseboards, matching color, texture, and lighting exactly. Keep every wall, window, door, ceiling, built-in fixture, light fixture, and architectural detail in its exact original position and finish — only freestanding furniture is removed. Natural lighting consistent with the room's existing light sources. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty room, empty of people.""",
        "negative_prompt": """remaining furniture, remaining rugs, remaining lamps, remaining wall art, altered walls, altered windows, altered doors, altered ceiling, altered built-in fixtures, warped walls, distorted proportions, mismatched flooring texture, mismatched wall texture, visible patches or seams, floating shadows, ghosting artifacts, discoloration, overexposure, harsh shadows, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.5, "max": 0.6, "default": 0.55},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "remove_clutter",
        "label": "Remove Clutter Only",
        "emoji": "🧹",
        "category": "removal",
        "prompt": """Professional real estate interior photograph of this exact room, with loose clutter and small miscellaneous items removed while all furniture stays in place. Remove stray items such as papers, boxes, cables, dishes, small personal objects, loose clothing, and miscellaneous items from floors, countertops, and surfaces. Keep every piece of furniture, all walls, windows, doors, floors, ceiling, and architectural detail in its exact original position, shape, and finish — only small loose clutter items are removed, nothing is rearranged or replaced. Surfaces appear clean and tidy where clutter was removed, with natural continuation of the existing surface material and lighting. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """remaining clutter, remaining stray items, moved furniture, removed furniture, altered layout, altered walls, altered windows, altered doors, altered flooring, warped walls, distorted proportions, mismatched surface texture, visible patches or seams, ghosting artifacts, discoloration, overexposure, harsh shadows, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.35, "max": 0.45, "default": 0.4},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "remove_personal_items",
        "label": "Remove Personal Items",
        "emoji": "📷",
        "category": "removal",
        "prompt": """Professional real estate interior photograph of this exact room, with personal items removed for neutral, buyer-ready presentation. Remove family photographs, personal artwork, religious or cultural items, toiletries, toys, personal documents, refrigerator magnets and notes, and any other identifying personal belongings from walls, surfaces, and shelves. Keep every piece of furniture, all walls, windows, doors, floors, ceiling, and architectural detail in its exact original position, shape, and finish — only personal and identifying items are removed, nothing else is rearranged or replaced. Surfaces and walls appear clean and neutral where items were removed, with natural continuation of the existing surface material and lighting. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """remaining personal photos, remaining personal artwork, remaining personal items, moved furniture, removed furniture, altered layout, altered walls, altered windows, altered doors, altered flooring, warped walls, distorted proportions, mismatched wall texture, visible patches or seams, ghosting artifacts, discoloration, overexposure, harsh shadows, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "remove_vehicles",
        "label": "Remove Vehicles",
        "emoji": "🚙",
        "category": "removal",
        "prompt": """Professional real estate exterior photograph of this exact property, with any parked or visible cars, trucks, or vehicles removed from the driveway, street, or curb. Fill the space where each vehicle was with the appropriate natural continuation of the driveway, road, lawn, or pavement, matching its existing texture, color, and lighting seamlessly. Keep the property itself — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Natural daylight throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, clean and polished finish, empty of people.""",
        "negative_prompt": """visible cars, trucks, vehicles, vehicle shadows or reflections, altered building structure, moved architectural elements, warped walls, distorted proportions, mismatched pavement texture, patchy or discolored driveway, visible editing seams, overexposure, harsh shadows, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # TWILIGHT PHOTOGRAPHY
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "id": "blue_hour",
        "label": "Blue Hour",
        "emoji": "🌆",
        "category": "twilight",
        "prompt": """Change this photo to blue hour — the period just after sunset. Keep the property itself completely unchanged: every wall, window, door, roofline, tree, fence, and landscape feature must remain in their exact original position, material, texture, and color — do not repaint, cover, move, shorten, or remove any structural element; never redesign, restyle, or substitute a different room — the output is this exact photo with only the furniture changes described, never a new rendering — and do not change the camera angle, perspective, or building shape. Only the sky and the lighting change: the sky glows in a rich, luminous blue-violet gradient with a warm golden glow blooming low on the horizon, still holding significant ambient daylight so every part of the house, lawn, and landscape remains well lit and clearly readable, only gently cooler and calmer than the original photo; interior lights glow warmly through every window; exterior architectural or landscape lighting, if present, is lit and glowing softly. Critical exposure requirement: blue hour is the brightest of the twilight moods — the sky holds meaningful natural light, the building facade stays bright and detailed, the garden and lawn are still clearly visible and richly colored, and the overall image stays roughly as bright as the original photo minus a modest twilight step — never a dark night scene, never crushed shadows, never murky. Apply natural, high-end real estate color grading with rich, true-to-life blue tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, daytime brightness, harsh sunlight, dark or unlit windows, flat lighting, fully black night sky, stars, moon, oversaturated neon colors, cartoonish sky, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "golden_dusk",
        "label": "Golden Dusk",
        "emoji": "🌇",
        "category": "twilight",
        "prompt": """Change this photo to golden dusk — the warm final moments of daylight just before the sun fully sets. Keep the property itself completely unchanged: every wall, window, door, roofline, tree, fence, and landscape feature must remain in their exact original position, material, texture, and color — do not repaint, cover, move, shorten, or remove any structural element; never redesign, restyle, or substitute a different room — the output is this exact photo with only the furniture changes described, never a new rendering — and do not change the camera angle, perspective, or building shape. Only the sky and the lighting change: the sky glows with rich gold, amber, and soft peach tones near the horizon, fading into deeper warm hues higher up; soft, warm, low-angle light washes across the building's exterior, casting long gentle shadows; interior lights begin to glow softly through the windows. Apply natural, high-end real estate color grading with warm, rich tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, midday brightness, harsh overhead lighting, overexposure, blown-out highlights, dark or unlit windows, flat lighting, cold blue tint, cartoonish sky, storm clouds, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "night_lights",
        "label": "Night Lights",
        "emoji": "🌃",
        "category": "twilight",
        "prompt": """Change this photo to night. Keep the property itself completely unchanged: every wall, window, door, roofline, tree, fence, and landscape feature must remain in their exact original position, material, texture, and color — do not repaint, cover, move, shorten, or remove any structural element; never redesign, restyle, or substitute a different room — the output is this exact photo with only the furniture changes described, never a new rendering — and do not change the camera angle, perspective, or building shape. Only the sky and the lighting change: the sky is a deep, dark navy, clear and smooth, with no visible stars or moon distracting from the property; every window glows warmly with interior lighting, illuminated as if the home is lived-in and inviting; exterior architectural lighting, pathway lights, and landscape lighting are all lit, softly illuminating walkways, entryways, and key architectural features without harsh glare. Critical exposure requirement: this is an inviting, luminous real-estate night scene, NOT a dark afterthought — the house and its facade stay clearly visible and well-exposed, as if lit like a luxury estate at dusk with rich warm light pooling on the walls and lawn from the lit windows; facade details, roof trim, siding, and landscape must remain fully readable — genuine architectural photography of a warmly lit home under a dark sky, never murky, never underexposed, never swallowed by shadow. Apply natural, high-end real estate color grading with balanced warm and cool contrast. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, daytime brightness, dark or unlit windows, unlit exterior lighting, pitch-black unreadable areas, harsh overexposed light sources, lens flare, oversaturated neon colors, cartoonish sky, stars, moon, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "dramatic_sunset",
        "label": "Dramatic Sunset",
        "emoji": "🌅",
        "category": "twilight",
        "prompt": """Change this photo to a dramatic, vivid sunset while keeping the scene as bright and readable as the original photo. Keep the property itself completely unchanged: every wall, window, door, roofline, tree, fence, and landscape feature must remain in their exact original position, material, texture, and color — do not repaint, cover, move, shorten, or remove any structural element; never redesign, restyle, or substitute a different room — the output is this exact photo with only the furniture changes described, never a new rendering — and do not change the camera angle, perspective, or building shape; the house remains the sharp, well-defined focal point against the bold sky. The result is a bright, readable sunset photograph — never underexposed, never a night shot: the sky fills with bold, saturated tones of deep red, orange, and magenta, with striking cloud formations catching intense sunset color near the horizon, while warm residual sunset light still illuminates the building's facade, entry, and landscaping clearly so every architectural detail stays visible with open, readable shadows. Interior lights may glow softly through windows. Apply natural, high-end real estate color grading with rich, dramatic contrast but open shadows — overall exposure stays close to the original photo. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, flat or gray sky, daytime brightness, overexposure, blown-out highlights, dark or unlit windows, unnatural neon oversaturation, cartoonish or fantasy sky, storm clouds, lightning, night sky, stars, moon, underexposed building, crushed shadows, silhouette building, foreground lost in darkness, night-dark scene, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 5, "max": 6, "default": 5.5}
    },
    {
        "id": "moody_atmospheric",
        "label": "Moody & Atmospheric",
        "emoji": "🌫️",
        "category": "twilight",
        "prompt": """Change this photo to a moody, atmospheric twilight. Keep the property itself completely unchanged: every wall, window, door, roofline, tree, fence, and landscape feature must remain in their exact original position, material, texture, and color — do not repaint, cover, move, shorten, or remove any structural element; never redesign, restyle, or substitute a different room — the output is this exact photo with only the furniture changes described, never a new rendering — and do not change the camera angle, perspective, or building shape. Only the sky and the lighting change: the sky is overcast to partly clouded with soft, muted gray-blue and violet tones, carrying a luminous, diffused glow across the whole sky that keeps the image bright and airy rather than dark — like an overcast evening where beautiful soft light still fills the scene; soft mist or light atmospheric haze may be gently present near the ground or tree line, adding depth without darkening the frame; interior lights glow warmly through windows, providing inviting contrast against the muted sky. Critical exposure requirement: moody does not mean dim — the house and its facade stay clearly visible and well-exposed with gentle, even light, the lawn and trees keep their natural coloring, and overall brightness stays close to the original photo minus a modest twilight step — never crushed shadows, never murky darkness, always an inviting, magazine-ready scene. Apply natural, high-end real estate color grading with soft, desaturated, cinematic tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, no people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, bright clear sky, harsh sunlight, overexposure, dark or unlit windows, flat lighting, oversaturated colors, vivid neon tones, heavy fog obscuring the property, storm or lightning, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    }
]

# Twilight negatives get the same structure-loss bans the staging presets
# carry inline: the failure mode is the model re-rendering the scene
# (staircase/brick/roofline drifting) while performing the edit.
# Furniture Removal presets are NEVER suffixed: all four run their exact
# specified text so "Do not include:" reaches the model byte-for-byte as
# written — the three Studio Dashboard prompts above, plus remove_vehicles
# as a clone of the photo-editor remove_cars preset. Structure protection
# for the three now lives inside their prompt text instead.
_STRUCTURE_NEGATIVE_LOCK = (
    "changed wall material or finish, exposed brick replaced with painted drywall, "
    "repainted or retextured walls, removed staircase, removed mezzanine or loft, "
    "removed ceiling beams or ductwork, removed built-in cabinets or fixtures, "
    "removed roofline elements, changed room or building layout, "
    "changed camera angle or viewpoint"
)
for _p in IMAGE_PRESETS:
    if _p.get("category") == "twilight":
        _p["negative_prompt"] = f"{_p['negative_prompt']}, {_STRUCTURE_NEGATIVE_LOCK}"


def get_presets_by_category(category):
    """Get all presets for a specific category"""
    return [p for p in IMAGE_PRESETS if p['category'] == category]

def get_preset_by_id(preset_id):
    """Get a specific preset by ID"""
    for p in IMAGE_PRESETS:
        if p['id'] == preset_id:
            return p
    return None
