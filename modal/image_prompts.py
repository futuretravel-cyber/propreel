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
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged with luxury modern furniture. Furnish the space with sleek, high-end contemporary furniture: a low-profile tufted sofa in neutral tones, a sculptural glass or marble coffee table, statement lighting fixtures, and tasteful decor accents such as a large abstract art piece and a designer area rug. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective and proportion, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Natural lighting consistent with the room’s existing light sources. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, curved vertical lines, furniture floating above floor, furniture clipping through walls, mismatched scale, oversized or undersized furniture, cluttered arrangement, blocked windows, blocked doorways, low-quality furniture textures, plastic textures, unrealistic shadows, mismatched lighting direction, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "scandinavian_minimal",
        "label": "Scandinavian Minimal",
        "emoji": "✨",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged in Scandinavian minimal style. Furnish the space sparingly with light natural wood furniture, a simple low sofa or accent chairs in soft neutral fabric, a woven textured rug, minimal clean-lined decor, and one or two potted plants. The overall palette stays light, airy, and uncluttered, with warm wood tones against white or soft neutral walls. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Bright, soft, natural daylight throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, cluttered or overcrowded room, dark or heavy furniture, ornate or baroque decor, blocked windows, blocked doorways, oversaturated colors, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "contemporary_dark",
        "label": "Contemporary Dark",
        "emoji": "🖤",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged in a contemporary dark and moody style. Furnish the space with sleek furniture in charcoal, black, and deep espresso tones — a modern sofa or sectional in dark upholstery, a matte black or dark wood coffee table, subtle metallic accents in brass or matte black, and layered ambient lighting such as a floor lamp or pendant fixture. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Lighting stays warm and inviting despite the dark palette, avoiding a flat or gloomy look. Apply natural, high-end real estate color grading with rich contrast. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, room appears underexposed or gloomy, muddy or crushed shadows, blocked windows, blocked doorways, cluttered arrangement, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "coastal_relaxed",
        "label": "Coastal Relaxed",
        "emoji": "🌊",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged in a relaxed coastal style. Furnish the space with light, breezy furniture: a slipcovered sofa in white or soft blue, natural rattan or light wood accent pieces, a jute or woven rug, linen textiles, and subtle nautical-inspired decor such as driftwood accents or soft blue-and-white patterns. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Bright, airy natural daylight throughout. Apply natural, high-end real estate color grading with soft, fresh tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, dark or heavy furniture, cluttered arrangement, blocked windows, blocked doorways, oversaturated or neon colors, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "family_comfortable",
        "label": "Family Comfortable",
        "emoji": "👨‍👩‍👧",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged as a comfortable family living space. Furnish the space with an inviting, durable-looking sofa and armchair in warm neutral tones, a sturdy coffee table, a soft area rug, warm accent lighting, and cozy homey decor such as throw pillows and a family-friendly bookshelf or media console. The overall look feels lived-in, welcoming, and practical rather than showroom-formal. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Warm, bright, natural lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, overly formal or cold styling, cluttered or messy arrangement, blocked windows, blocked doorways, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "luxury_bedroom",
        "label": "Luxury Bedroom",
        "emoji": "🛏️",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty bedroom, virtually staged as a luxury bedroom retreat. Furnish the space with a plush upholstered king or queen bed with high-quality layered bedding, matching nightstands with elegant lamps, a tasteful bench or accent chair at the foot of the bed, soft area rug, and refined decor such as framed art or a decorative mirror. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, positioned to keep windows, closet doors, and walkways clear. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Soft, warm, inviting lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, bed blocking door or closet, cluttered arrangement, mismatched bedding patterns, blocked windows, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "home_office",
        "label": "Home Office",
        "emoji": "💼",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged as a functional, stylish home office. Furnish the space with a clean-lined desk, an ergonomic yet elegant office chair, a bookshelf or storage unit, tasteful desk accessories, good task lighting, and subtle decor such as a plant or framed art to keep the space feeling professional and inviting rather than sterile. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail in its exact original position and finish. Bright, natural, productive lighting throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, cluttered or messy desk, tangled cables, blocked windows, blocked doorways, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "industrial_loft",
        "label": "Industrial Loft",
        "emoji": "⚙️",
        "category": "staging",
        "prompt": """Professional real estate interior photograph of this exact empty room, virtually staged in an industrial loft style. Furnish the space with furniture that complements exposed architectural character: a weathered leather sofa, a reclaimed wood or metal-framed coffee table, black metal accent lighting, an area rug with muted tones, and raw-material decor accents such as metal shelving or exposed-bulb fixtures. All furniture is sized, placed, and oriented realistically for the room’s actual dimensions, sitting flush on the floor with correct perspective, and does not block windows, doors, or walkways. Keep every wall, window, door, floor, ceiling, and architectural detail — including any existing exposed brick, beams, or ductwork — in its exact original position and finish. Warm ambient lighting throughout. Apply natural, high-end real estate color grading with rich, earthy tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered walls, altered windows, altered doors, altered flooring, altered ceiling, altered exposed brick or beams, warped walls, distorted proportions, furniture floating above floor, furniture clipping through walls, mismatched scale, overly delicate or ornate furniture, cluttered arrangement, blocked windows, blocked doorways, plastic textures, unrealistic shadows, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
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
        "emoji": "👤",
        "category": "removal",
        "prompt": """Professional real estate interior photograph of this exact room, with personal items removed for neutral, buyer-ready presentation. Remove family photographs, personal artwork, religious or cultural items, toiletries, toys, personal documents, refrigerator magnets and notes, and any other identifying personal belongings from walls, surfaces, and shelves. Keep every piece of furniture, all walls, windows, doors, floors, ceiling, and architectural detail in its exact original position, shape, and finish — only personal and identifying items are removed, nothing else is rearranged or replaced. Surfaces and walls appear clean and neutral where items were removed, with natural continuation of the existing surface material and lighting. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """remaining personal photos, remaining personal artwork, remaining personal items, moved furniture, removed furniture, altered layout, altered walls, altered windows, altered doors, altered flooring, warped walls, distorted proportions, mismatched wall texture, visible patches or seams, ghosting artifacts, discoloration, overexposure, harsh shadows, plastic textures, unrealistic reflections, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "remove_vehicles",
        "label": "Remove Vehicles",
        "emoji": "🚗",
        "category": "removal",
        "prompt": """Professional real estate exterior photograph of this exact property, with all cars, trucks, motorcycles, and other vehicles removed from the driveway, street, curb, or yard. Reconstruct the driveway, road, lawn, or pavement where each vehicle was removed with seamless, natural continuation of the existing surface material, color, and texture, matching the surrounding lighting and shadow direction exactly. Keep the property itself — every wall, window, door, roofline, tree, fence, and landscape feature — in its exact original position, shape, and proportion. Natural daylight throughout. Apply natural, high-end real estate color grading. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """visible cars, trucks, motorcycles, vehicles, vehicle shadows, vehicle reflections, altered building structure, moved architectural elements, warped walls, distorted proportions, mismatched pavement texture, patchy or discolored driveway, visible editing seams, ghosting artifacts, overexposure, harsh shadows, low resolution, grain, noise, people, animals, text, watermark, logo, clutter""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },


    # ═══════════════════════════════════════════════════════════════════════════
    # TWILIGHT PHOTOGRAPHY
    # ═══════════════════════════════════════════════════════════════════════════
    {
        "id": "blue_hour",
        "label": "Blue Hour",
        "emoji": "🌆",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured during blue hour — the period just after sunset when the sky holds a deep, rich blue-violet gradient with a faint warm glow remaining low on the horizon. The sky is smooth and richly saturated in cool blue and indigo tones, darkening toward the top of the frame. Interior lights glow warmly through every window, creating an inviting contrast between the cool exterior dusk and warm interior glow. Exterior architectural or landscape lighting, if present, is lit and glowing softly. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with rich, true-to-life blue tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, daytime brightness, harsh sunlight, dark or unlit windows, flat lighting, fully black night sky, stars, moon, oversaturated neon colors, cartoonish sky, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "golden_dusk",
        "label": "Golden Dusk",
        "emoji": "🌇",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured at golden dusk — the warm final moments of daylight just before the sun fully sets. The sky glows with rich gold, amber, and soft peach tones near the horizon, fading into deeper warm hues higher up. Soft, warm, low-angle light washes across the building's exterior, casting long gentle shadows. Interior lights begin to glow softly through the windows, adding warmth and depth. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with warm, rich tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, midday brightness, harsh overhead lighting, overexposure, blown-out highlights, dark or unlit windows, flat lighting, cold blue tint, cartoonish sky, storm clouds, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "night_lights",
        "label": "Night Lights",
        "emoji": "🌃",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured at night. The sky is a deep, dark navy-black, clear and smooth, with no visible stars or moon distracting from the property. Every window glows warmly with interior lighting, illuminated as if the home is lived-in and inviting. Exterior architectural lighting, pathway lights, and landscape lighting are all lit, softly illuminating walkways, entryways, and key architectural features without harsh glare. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with balanced warm and cool contrast. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, daytime brightness, dark or unlit windows, unlit exterior lighting, pitch-black unreadable areas, harsh overexposed light sources, lens flare, oversaturated neon colors, cartoonish sky, stars, moon, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    },
    {
        "id": "dramatic_sunset",
        "label": "Dramatic Sunset",
        "emoji": "🌅",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured against a dramatic, vivid sunset sky. The sky is filled with bold, saturated tones of deep red, orange, and magenta, with striking cloud formations catching intense sunset color and dramatic backlighting near the horizon. Rich, warm, low-angle light rakes across the building's exterior, casting long dramatic shadows. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion; the house remains the sharp, well-defined focal point against the bold sky. Apply natural, high-end real estate color grading with rich, dramatic contrast. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, flat or gray sky, daytime brightness, overexposure, blown-out highlights, dark or unlit windows, unnatural neon oversaturation, cartoonish or fantasy sky, storm clouds, lightning, night sky, stars, moon, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 5, "max": 6, "default": 5.5}
    },
    {
        "id": "moody_atmospheric",
        "label": "Moody & Atmospheric",
        "emoji": "🌫️",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured in a moody, atmospheric twilight mood. The sky is overcast to partly clouded with soft, muted gray-blue and violet tones, with a faint diffused glow near the horizon suggesting a recently set sun. Soft mist or light atmospheric haze may be gently present near the ground or tree line, adding depth without obscuring the property. Interior lights glow warmly through windows, providing inviting contrast against the muted sky. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion. Apply natural, high-end real estate color grading with soft, desaturated, cinematic tones. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, warped walls, distorted proportions, bright clear sky, harsh sunlight, overexposure, dark or unlit windows, flat lighting, oversaturated colors, vivid neon tones, heavy fog obscuring the property, storm or lightning, low resolution, grain, noise, people, animals, vehicles, text, watermark, logo""",
        "strength": {"min": 0.4, "max": 0.5, "default": 0.45},
        "guidanceScale": {"min": 4, "max": 5, "default": 4.5}
    },
    {
        "id": "festive_evening",
        "label": "Festive Evening",
        "emoji": "🎄",
        "category": "twilight",
        "prompt": """Professional real estate exterior photograph of this exact property, captured on a festive evening. The sky is a deep twilight blue, clear and smooth. Tasteful holiday and festive lighting is added along the roofline, around windows, doorways, and any existing trees or shrubs, glowing warmly without appearing gaudy or overdone. Every window glows warmly with interior lighting. Exterior pathway and landscape lighting are lit, adding to the festive, welcoming atmosphere. Keep the property — every wall, window, door, roofline, tree, and landscape feature — in its exact original position, shape, and proportion; lighting is added onto existing features, nothing is structurally altered. Apply natural, high-end real estate color grading with warm, festive contrast. Hyper-realistic, magazine-quality architectural photography, ultra-high resolution, empty of people.""",
        "negative_prompt": """altered building structure, moved architectural elements, added structures, warped walls, distorted proportions, daytime brightness, dark or unlit windows, unlit exterior lighting, garish or oversaturated neon lighting, cluttered or excessive decorations, inflatable decorations, cartoonish styling, low resolution, grain, noise, people, animals, text, watermark, logo""",
        "strength": {"min": 0.45, "max": 0.55, "default": 0.5},
        "guidanceScale": {"min": 4.5, "max": 5.5, "default": 5}
    }
]

# Twilight negatives get the same structure-loss bans the staging presets
# carry inline: the failure mode is the model re-rendering the scene
# (staircase/brick/roofline drifting) while performing the edit.
# 2026-10-16: EVERY preset category — Photo Editor, Staging, Removal and
# Twilight — now runs ONE whole-image openai/gpt-image-2.5/flare/edit
# call (no mask, no Kontext fallback, no deterministic side-paths). Each
# prompt carries its own keep-the-architecture contract and its negative
# rides inside the prompt as an explicit "Avoid:" clause (the endpoint
# publishes no negative_prompt argument). Vehicle removal exists in both
# the AI Photo Editor (remove_cars, gentler) and Furniture Removal
# (remove_vehicles, full rebuild of driveway/street).
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
