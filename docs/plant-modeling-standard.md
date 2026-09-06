# Factory plant modeling standard

The indoor hanging pothos is the visual benchmark: solid leaves with softly beveled edges, visible veins, curved stems, quiet green colors and a small amount of motion. Plant species keep their own recognizable shapes while sharing this level of construction. These rules apply to procedural Three.js plants and imported Blender models.

## Canonical building blocks

- `client/prototypes/factory25dPothosFoliage.ts` owns the approved pothos outline, thickness, bevel, palette, vein placement, vine tubes, leaf poses and sway. Reuse these helpers for hanging baskets, shelf pots and patio trails. Change the strand arrangement to fit the container.
- `client/prototypes/factory25dHouseplantFoliage.ts` owns the detailed indoor fern, palm, monstera, rubber plant, calathea and bonsai families. It uses the pothos material treatment and adds species-specific solid leaf shapes.
- `client/prototypes/factory25dPlants.ts` owns indoor placement, pot dimensions, shelf attachment, contact shadows and the existing movable-plant identity. Foliage changes belong inside the model, not in scene placement or navigation.
- `client/prototypes/factory25dPatioGarden.ts` owns patio planter arrangements and outdoor maple/pine foliage. `factory25dLandscape.ts` owns the simpler distant forest.

## Shape and anatomy

Close plants have solid leaves with visible edges and backs. Small bevels catch the room lighting; the center vein or fold adds depth. Leaflets attach to a curved stem, stems connect to branches or the root, and the root meets the soil. Keep air between leaves and branches so the plant reads as a living structure when inspected.

| Family | Defining shape |
| --- | --- |
| Pothos | Unsplit heart-shaped leaves, visible center veins, alternating leaves on gently curving trails |
| Boston fern | Low crown of arching fronds, paired tapered leaflets, varied frond heights |
| Areca palm | Several slender canes, elevated feathered fronds, longer narrow leaflets and drooping tips |
| Rubber plant | Upright main stem, spaced rounded oval leaves with substantial edges |
| Calathea | Broad oval leaves on separate curved stalks, restrained paired markings and a center vein |
| Monstera | Large leaves with a split outline, substantial stalks and a clear central vein |
| Bonsai | Bent trunk, visible forks and twigs, small individual leaves forming unequal canopy tiers |
| Maple / mountain pine | Palmate leaves / layered needle sprays; retain their distinct outdoor tree silhouettes |

Foreground canopy detail should come from leaves and branching. Solid balls or faceted lumps can support distant foliage, where individual leaves would become visual noise.

## Color and material

The approved pothos palette is `#448047`, `#588d49`, `#366c3c`, with `#456a37` stems and `#9bb95f` veins. Treat these as palette anchors; species can use quieter veins and darker or cooler greens. Color variation should describe leaf age, species and orientation.

Use real room lighting and shadows. The canonical foliage uses `MeshStandardMaterial`, roughness `1`, metalness `0`, and the very low emissive tint `#091408`. Keep new foliage matte to gently waxy. Outdoor wetness may lower roughness through the shared weather state. Avoid baked highlights, baked shadows, bright self-illumination or photographic leaf textures that conflict with the sculpted room.

## Scale and placement

Scene dimensions use meters. The canonical pothos leaf is roughly 0.21 wide and 0.24 long before its existing scale variation, with 0.015 extrusion depth and a small 0.006-thick bevel. These proportions are a reference for visible thickness, not a requirement that every species have the same dimensions.

Keep the pot, soil and foliage as separate parts. The full plant root sits at the pot base; the foliage root sits at the soil surface. Preserve existing pot positions, shelf levels and movable-plant group references. Trailing leaves must clear the shelf lip before hanging down and stay above the floor. Canopy changes must leave the walking lanes, desks and nearby interactions usable.

Blender assets should use the same meter scale and runtime Y-up coordinates after export. Apply scale, keep the root at the intended planting point, and export glTF/GLB geometry and materials without lights, cameras or baked room lighting. Existing procedural plants remain the reference for in-room comparison.

## Motion and weather

Anchor motion at the root of a vine, frond or leaf. The reference pothos sway is about 0.013 radians (0.75 degrees) with an approximately ten-second cycle. Vary phase between strands; preserve the resting pose. Large branches and trunks should move less than leaf tips.

Use the existing scene update loop. Reduced motion returns each animated part to its resting transform, without accumulated rotation. Snow belongs on exposed upper foliage surfaces, and rain/wetness belongs to the shared weather state. Indoor plants should not acquire outdoor snow or rain behavior.

## Detail and rendering

The room renders at 800 × 564 with pixel scaling. Check the actual render at normal room size and the existing 2.5× inspection zoom. A detail that only looks good in a high-resolution modeling viewport is not sufficient.

Reuse leaf and vein geometry and materials. Instance repeated leaves when practical; keep animation at grouped stems/fronds so updates do not allocate new geometry. Distant mountain trees use simpler silhouettes and fewer layers. Newly owned render resources must have a clear lifetime; do not create materials or geometry inside frame updates.

## Review a plant change

1. Inspect the real plant in its room, including its shelf or pot, before changing it.
2. Check the updated silhouette across the room and leaf/stem connections at inspection zoom.
3. Check daylight, night and reduced motion; include rain and snow for outdoor foliage.
4. Confirm pot/soil grounding, shelf clearance, model bounds and existing movable-plant behavior.
5. Preserve the canonical hanging pothos. Changes to shared helpers should retain its geometry, palette, transforms and motion unless its appearance is explicitly part of the requested change.

This standard is established with the detailed houseplant pass. Cactus, succulent, snake plant and bird-of-paradise models keep their existing construction in this pass; the distant forest intentionally keeps simpler forms.
