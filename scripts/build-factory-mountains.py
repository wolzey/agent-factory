"""Authored limestone benches and branching summit, exported without baked lighting.

Run via `npx tsx scripts/build-factory-mountains.ts`. The original ground is used
at the meadow/shoreline boundary; the western formation and eastern summit are
reshaped here. Blender triangulation, decimation and smooth normals produce the
actual shipped mesh. No Blender code or runtime is loaded by the game.
"""
import bpy
import json
import math
import os
import sys

ground_path, output = sys.argv[sys.argv.index('--') + 1:]
with open(ground_path) as source:
    ground = json.load(source)

def smooth(a, b, value):
    t = max(0, min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)

def profile(x, points):
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        if x <= bx:
            t = max(0, min(1, (x - ax) / (bx - ax)))
            return ay + (by - ay) * t
    return points[-1][1]

def western(x, z):
    crest = profile(x, [(-11, 1.8), (-9.8, 1.9), (-8.9, 1.84),
        (-8, 2.02), (-7.2, 1.94), (-6.25, 2.18), (-5.65, 2.09), (-4.7, 1.25), (-4, 0.35)])
    lip = profile(x, [(-11, -3.6), (-9.5, -3.4), (-8.6, -3.9),
        (-7.9, -3.15), (-7.15, -4.0), (-6.5, -4.45), (-5.8, -4.15), (-5, -5.6), (-4, -7.3)])
    # Three unequal courses project into the valley. Broad gullies break the
    # outline instead of adding random triangle colors or a grassy flat lid.
    lip += math.sin(x * 2.1) * 0.07
    d = z - lip
    face = profile(d, [(-5, 0), (0, 0), (0.2, 0.48), (0.54, 0.5),
        (0.79, 0.97), (1.16, 1.0), (1.45, 1.3), (2.7, 1.6), (4, 2.0)])
    top = crest + math.sin(x * 1.1 + z * 0.35) * 0.035
    height = top - face
    for center, width, depth in [(-9.05, 0.18, 0.19), (-7.1, 0.24, 0.25), (-5.4, 0.22, 0.2)]:
        bend = center + math.sin(z * 1.15) * 0.1
        cut = math.exp(-((x - bend) / width) ** 2) * depth
        height -= cut * smooth(-0.12, 0.28, d) * (1 - smooth(1.8, 2.5, d))
    height -= smooth(-7.6, -11.5, z) * 1.5
    return height

RIDGES = [
    ((5.0, 2.78, -6.5), (3.75, 1.95, -4.7), 0.7),
    ((3.75, 1.95, -4.7), (2.65, 1.27, -3.0), 0.67),
    ((2.65, 1.27, -3.0), (0.4, 0.32, -0.5), 0.49),
    ((3.75, 1.95, -4.7), (4.2, 1.44, -2.65), 0.72),
    ((5.0, 2.78, -6.5), (6.3, 2.08, -5.1), 0.68),
    ((6.3, 2.08, -5.1), (6.8, 1.45, -2.8), 0.55),
    ((6.3, 2.08, -5.1), (8.15, 1.85, -5.7), 0.63),
    ((8.15, 1.85, -5.7), (9.7, 1.05, -2.5), 0.48),
    ((4.1, 1.55, -5.5), (2.5, 1.15, -5.7), 0.8),
    ((5.0, 2.78, -6.5), (3.1, 1.95, -6.2), 0.78),
    ((5.0, 2.78, -6.5), (7.45, 2.3, -7.0), 0.78),
    ((7.45, 2.3, -7.0), (8.4, 1.72, -4.5), 0.67),
]

def eastern(x, z):
    height = 0.24 + min(0.5, abs(x + 1.1) * 0.065)
    for a, b, slope in RIDGES:
        dx, dz = b[0] - a[0], b[2] - a[2]
        t = max(0, min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)))
        distance = math.hypot(x - a[0] - dx * t, z - a[2] - dz * t)
        # A defined crest meets broad planar slopes; connected shoulders keep
        # the silhouette asymmetric instead of rounding into a single cone.
        fall = distance * slope
        height = max(height, a[1] + (b[1] - a[1]) * t - fall)
    # Connected erosion channels descend from the summit to the scree.
    for ax, az, bx, bz, depth in [(4.8, -6.2, 2.9, -2.6, 0.22),
        (5.15, -6.1, 5.15, -2.5, 0.28), (6.5, -4.9, 8.2, -2.1, 0.17)]:
        dx, dz = bx - ax, bz - az
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
        across = abs((x - ax) * dz - (z - az) * dx) / math.hypot(dx, dz)
        height -= math.sin(t * math.pi) * depth * math.exp(-(across / (0.16 + t * 0.22)) ** 2)
    return height

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
columns, rows = ground['columns'], ground['rows']
vertices, faces = [], []
for row in range(rows + 1):
    z = ground['z0'] + row / rows * ground['depth']
    for col in range(columns + 1):
        x = ground['x0'] + col / columns * ground['width']
        original = ground['heights'][row * (columns + 1) + col]
        height = original
        west_blend = (1 - smooth(-4.9, -3.6, x)) * (1 - smooth(-1.3, 0.8, z)) * smooth(-12, -8, z)
        height += (max(0.18, western(x, z)) - height) * west_blend
        east_blend = smooth(0.4, 2.0, x) * (1 - smooth(-1.8, 0.1, z)) * smooth(-12, -8, z)
        height += (eastern(x, z) - height) * east_blend
        vertices.append((x, -z, height))  # Blender Z-up -> exported glTF Y-up.
        if row < rows and col < columns:
            a = row * (columns + 1) + col
            faces.extend([(a, a + columns + 1, a + 1), (a + 1, a + columns + 1, a + columns + 2)])

mesh = bpy.data.meshes.new('Utah carved terrain')
mesh.from_pydata(vertices, [], faces)
mesh.update()
terrain = bpy.data.objects.new('Utah_Mountains', mesh)
bpy.context.collection.objects.link(terrain)
bpy.context.view_layer.objects.active = terrain
terrain.select_set(True)
decimate = terrain.modifiers.new('Game mesh budget', 'DECIMATE')
decimate.ratio = 0.1225
bpy.ops.object.modifier_apply(modifier=decimate.name)
# Preserve the actual lip between a shelf and a cliff while sharing normals
# over each broad rock face. This splits formations, not every triangle.
edges = terrain.modifiers.new('Cliff lip normals', 'EDGE_SPLIT')
edges.split_angle = math.radians(38)
bpy.ops.object.modifier_apply(modifier=edges.name)
mesh = terrain.data
for polygon in mesh.polygons:
    polygon.use_smooth = True

def linear(rgb):
    return tuple(c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)

def color(hexcode):
    return linear(tuple(int(hexcode[i:i + 2], 16) / 255 for i in (0, 2, 4)))

def blend(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

grass, dry = color('647f43'), color('919766')
limestone, slate = color('b9b29e'), color('9d9e98')
attribute = mesh.color_attributes.new(name='TerrainColor', type='FLOAT_COLOR', domain='POINT')
for vertex in mesh.vertices:
    x, negz, h = vertex.co
    z = -negz
    up = max(0, vertex.normal.z)
    rock = 1 - smooth(0.85, 0.975, up)
    summit = smooth(0.9, 1.65, h) * smooth(0.5, 2.0, x) * (1 - smooth(-2, -0.3, z))
    albedo = blend(grass, dry, 0.28 + math.sin(x * 0.6 + z * 0.3) * 0.12)
    stone = blend(limestone, slate, smooth(-4.8, 2.0, x))
    # Quiet bedding follows elevation across adjoining polygons. These are
    # mineral colors only; directional light, shadows, snow and haze stay live.
    course = (h + math.sin(x * 0.44) * 0.035) * 8.0
    bed = 0.96 if int(course) % 4 == 0 else 1.025
    stone = tuple(c * bed for c in stone)
    albedo = blend(albedo, stone, max(rock, summit * 0.9))
    attribute.data[vertex.index].color = (*albedo, 1.0)
mesh.color_attributes.active_color = attribute
mat = bpy.data.materials.new('Natural albedo — weather lit in game')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = 1
colors = mat.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = attribute.name
mat.node_tree.links.new(colors.outputs['Color'], bsdf.inputs['Base Color'])
terrain.data.materials.append(mat)
mesh.calc_loop_triangles()
terrain['authoring'] = 'Blender: layered western limestone and branching eastern summit'
terrain['triangles'] = len(mesh.loop_triangles)
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True,
    export_yup=True, export_normals=True, export_texcoords=False, export_animations=False,
    export_extras=True)
print(json.dumps({'asset': output, 'vertices': len(mesh.vertices),
    'triangles': len(mesh.loop_triangles), 'bytes': os.path.getsize(output)}))
