import * as THREE from 'three';
import { createPothosFoliage, createPothosStrand, pothosMaterial, pothosSway } from './factory25dPothosFoliage';
// See docs/plant-modeling-standard.md before adding another leaf family.
export function createHouseplantFoliage() {
    const pothos = createPothosFoliage();
    const greens = pothos.leafMaterials.map(material => material.color);
    const leafMaterial = pothosMaterial('#ffffff');
    const broadMaterials = ['#2c6338', '#367443', '#245831'].map(pothosMaterial);
    const veinMaterial = pothosMaterial('#648747');
    const stemMaterial = pothos.stemMaterial;
    const caneMaterial = pothosMaterial('#7b8660');
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    for (const [x, y] of [[-.065, .12], [-.10, .35], [-.07, .7], [0, 1], [.07, .7], [.10, .35], [.065, .12]])
        bladeShape.lineTo(x, y);
    bladeShape.closePath();
    const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: .055, bevelEnabled: true, bevelThickness: .014, bevelSize: .014, bevelSegments: 1, steps: 1 });
    const points = blade.attributes.position;
    for (let i = 0; i < points.count; i++)
        points.setZ(i, points.getZ(i) + Math.sin(points.getY(i) * Math.PI) * .05);
    blade.computeVertexNormals();
    const rib = new THREE.BoxGeometry(.018, .67, .022).translate(0, .41, .098);
    const up = new THREE.Vector3(0, 1, 0);
    const barkMaterial = pothosMaterial('#6c5543');
    function solidLeaf(outline: number[][]) {
        const shape = new THREE.Shape();
        shape.moveTo(outline[0][0], outline[0][1]);
        outline.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 1, steps: 1 });
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++)
            position.setZ(i, position.getZ(i) + Math.sin(position.getY(i) * Math.PI) * .065);
        geometry.computeVertexNormals();
        return geometry;
    }
    const oval = solidLeaf([[0, 0], [-.13, .07], [-.24, .27], [-.27, .56], [-.18, .85], [0, 1], [.18, .85], [.27, .56], [.24, .27], [.13, .07]]);
    const calathea = solidLeaf([[0, 0], [-.17, .09], [-.30, .32], [-.31, .58], [-.19, .84], [0, 1], [.19, .84], [.31, .58], [.30, .32], [.17, .09]]);
    const monstera = solidLeaf([
        [0, .10], [-.12, .02], [-.30, .09], [-.43, .24], [-.15, .25], [-.49, .43], [-.47, .57], [-.16, .44],
        [-.43, .74], [-.33, .89], [-.11, .63], [0, 1.03], [.11, .63], [.33, .89], [.43, .74],
        [.16, .44], [.47, .57], [.49, .43], [.15, .25], [.43, .24], [.30, .09], [.12, .02],
    ]);
    const midrib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, .06, .08), new THREE.Vector3(0, .4, .12), new THREE.Vector3(0, .82, .10),
    ]), 8, .011, 4, false);
    const stripeMaterial = pothosMaterial('#6b9652');
    const stripeGeometry = new THREE.BufferGeometry();
    const stripeVertices: number[] = [];
    for (let row = 0; row < 5; row++)
        for (const side of [-1, 1]) {
            const y = .19 + row * .115, width = .25 * Math.sin(y * Math.PI);
            stripeVertices.push(side * .024, y, .052 + Math.sin(y * Math.PI) * .065, side * width, y + .07, .052 + Math.sin((y + .07) * Math.PI) * .065, side * .024, y + .035, .052 + Math.sin((y + .035) * Math.PI) * .065);
        }
    stripeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stripeVertices, 3));
    stripeGeometry.computeVertexNormals();
    stripeMaterial.side = THREE.DoubleSide;
    function aimLeaf(pose: THREE.Object3D, point: THREE.Vector3, direction: THREE.Vector3, length: number, width = 1) {
        const y = direction.clone().normalize(), normal = up.clone().addScaledVector(y, -up.dot(y)).normalize();
        const x = y.clone().cross(normal).normalize();
        pose.position.copy(point);
        pose.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, normal));
        pose.scale.set(length * width, length, length);
        pose.updateMatrix();
    }
    function foliageMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = mesh.receiveShadow = true;
        return mesh;
    }
    function stem(curve: THREE.CatmullRomCurve3, radius: number, material = stemMaterial) {
        return foliageMesh(new THREE.TubeGeometry(curve, 12, radius, 5, false), material);
    }
    function trailing(phase: number, elevated: boolean) {
        const group = new THREE.Group();
        group.name = 'Potted pothos';
        const strands: THREE.Group[] = [];
        for (let i = 0; i < 5; i++) {
            const angle = i * 2.4 + phase;
            const x = Math.cos(angle), z = Math.sin(angle);
            const long = elevated && i < 3;
            const side = (i - 1) * .16;
            const curve = new THREE.CatmullRomCurve3(long ? [
                new THREE.Vector3(side * .2, .04, .02), new THREE.Vector3(side * .7, .07, .34),
                new THREE.Vector3(side, -.06, .52), new THREE.Vector3(side + .035 * Math.sin(i), -.43 - i * .07, .56),
            ] : [
                new THREE.Vector3(x * .035, .025, z * .035), new THREE.Vector3(x * .17, .075, z * .17),
                new THREE.Vector3(x * .28, -.055, z * .28), new THREE.Vector3(x * .31, -.15, z * .31),
            ]);
            const strand = createPothosStrand(pothos, curve, i + Math.floor(phase), long ? 0 : Math.atan2(x, z), long ? 7 : 5, .58);
            group.add(strand);
            strands.push(strand);
        }
        return { group, update(time: number, reduced: boolean) {
                strands.forEach((strand, i) => { strand.rotation.z = pothosSway(time, i + phase, reduced); });
            } };
    }
    function fronds(kind: 'fern' | 'palm', phase: number) {
        const group = new THREE.Group();
        group.name = kind === 'fern' ? 'Boston fern' : 'Areca palm';
        const fronds: THREE.Group[] = [];
        const palm = kind === 'palm';
        const count = palm ? 9 : 8;
        for (let f = 0; f < count; f++) {
            const angle = f * 2.4 + phase;
            const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
            const reach = palm ? .48 + (f % 3) * .045 : .40 + (f % 3) * .045;
            const height = palm ? .44 + (f % 3) * .09 : .02;
            const root = palm ? new THREE.Vector3(Math.cos(f % 3 * 2.1) * .045, height, Math.sin(f % 3 * 2.1) * .045) : new THREE.Vector3();
            if (palm && f < 3) {
                const cane = new THREE.CatmullRomCurve3([new THREE.Vector3(root.x * .3, 0, root.z * .3), new THREE.Vector3(root.x * .7, height * .5, root.z * .7), root]);
                group.add(stem(cane, .015, caneMaterial));
            }
            const frond = new THREE.Group();
            frond.position.copy(root);
            frond.name = palm ? 'Palm feather' : 'Fern frond';
            const rise = palm ? .19 : .16 + (f % 3) * .065;
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(), radial.clone().multiplyScalar(reach * .27).add(new THREE.Vector3(0, rise, 0)),
                radial.clone().multiplyScalar(reach * .65).add(new THREE.Vector3(0, rise * .88, 0)),
                radial.clone().multiplyScalar(reach).add(new THREE.Vector3(0, palm ? -.08 : .01 + (f % 3) * .035, 0)),
            ]);
            frond.add(stem(curve, palm ? .010 : .008));
            const pairs = palm ? 9 : 8;
            const leaves = new THREE.InstancedMesh(blade, leafMaterial, pairs * 2 + 1);
            const veins = new THREE.InstancedMesh(rib, veinMaterial, pairs * 2 + 1);
            const pose = new THREE.Object3D(), basis = new THREE.Matrix4();
            function leaflet(point: THREE.Vector3, direction: THREE.Vector3, length: number, width: number, index: number) {
                const y = direction.normalize(), normal = up.clone().addScaledVector(y, -up.dot(y)).normalize();
                const x = y.clone().cross(normal).normalize();
                pose.position.copy(point);
                pose.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, normal));
                pose.scale.set(length * width, length, length);
                pose.updateMatrix();
                leaves.setMatrixAt(index, pose.matrix);
                leaves.setColorAt(index, greens[(index + f) % 3]);
                veins.setMatrixAt(index, pose.matrix);
            }
            for (let p = 0; p < pairs; p++)
                for (const side of [-1, 1]) {
                    const t = .14 + p / (pairs + 1) * .78, point = curve.getPoint(t);
                    const length = (palm ? .23 : .17) * Math.pow(Math.sin(Math.PI * t), .65);
                    const direction = across.clone().multiplyScalar(side).addScaledVector(radial, .28 + (palm ? .12 : 0));
                    direction.y = palm ? -.18 - t * .25 : .05 - t * .12;
                    leaflet(point, direction, length, palm ? .72 : 1.14, p * 2 + (side === 1 ? 1 : 0));
                }
            leaflet(curve.getPoint(.94), curve.getTangent(.94), palm ? .12 : .09, palm ? .62 : .9, pairs * 2);
            for (const mesh of [leaves, veins]) {
                mesh.castShadow = mesh.receiveShadow = true;
                mesh.computeBoundingSphere();
                frond.add(mesh);
            }
            group.add(frond);
            fronds.push(frond);
        }
        return { group, update(time: number, reduced: boolean) {
                fronds.forEach((frond, i) => { frond.rotation.z = pothosSway(time * .85, i + phase, reduced); });
            } };
    }
    function broadleaf(kind: 'broad' | 'rubber' | 'calathea', phase: number) {
        const group = new THREE.Group();
        group.name = kind === 'broad' ? 'Monstera' : kind === 'rubber' ? 'Rubber plant' : 'Calathea';
        const leaves: THREE.Group[] = [];
        const rubber = kind === 'rubber', patterned = kind === 'calathea';
        const geometry = rubber ? oval : patterned ? calathea : monstera;
        const count = rubber ? 7 : patterned ? 7 : 5;
        const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.025, .25, .015), new THREE.Vector3(-.018, .59, .025)]);
        if (rubber)
            group.add(stem(trunk, .017));
        for (let i = 0; i < count; i++) {
            const angle = i * 2.4 + phase, radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const root = rubber ? trunk.getPoint(.14 + i * .12) : new THREE.Vector3(radial.x * .02, 0, radial.z * .02);
            const tip = radial.clone().multiplyScalar(rubber ? .11 : .11 + (i % 3) * .035);
            tip.y = rubber ? root.y + .035 : .18 + (i % 3) * .12;
            const curve = new THREE.CatmullRomCurve3([root, root.clone().lerp(tip, .45).add(new THREE.Vector3(0, .025, 0)), tip]);
            group.add(stem(curve, rubber ? .009 : .012));
            const leaf = new THREE.Group();
            leaf.name = 'Veined leaf';
            const direction = radial.clone();
            direction.y = rubber ? .24 : .38 + (i % 3) * .1;
            aimLeaf(leaf, tip, direction, rubber ? .25 + (i % 2) * .035 : patterned ? .34 + (i % 3) * .025 : .41 + (i % 3) * .035);
            leaf.add(foliageMesh(geometry, broadMaterials[i % 3]), foliageMesh(midrib, veinMaterial));
            if (patterned)
                leaf.add(foliageMesh(stripeGeometry, stripeMaterial));
            group.add(leaf);
            leaves.push(leaf);
        }
        const resting = leaves.map(leaf => leaf.quaternion.clone());
        const sway = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
        return { group, update(time: number, reduced: boolean) {
                leaves.forEach((leaf, i) => { leaf.quaternion.copy(resting[i]).multiply(sway.setFromAxisAngle(axis, pothosSway(time, i + phase, reduced))); });
            } };
    }
    function bonsai(phase: number) {
        const group = new THREE.Group();
        group.name = 'Leafy bonsai';
        const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(-.065, .22, .015), new THREE.Vector3(.018, .44, 0), new THREE.Vector3(-.04, .67, -.02)]);
        group.add(stem(trunk, .031, barkMaterial));
        const leaves = new THREE.InstancedMesh(oval, leafMaterial, 63), veins = new THREE.InstancedMesh(midrib, veinMaterial, 63);
        const pose = new THREE.Object3D();
        let placed = 0;
        for (const [tier, x, y, z] of [[0, -.20, .40, .04], [1, .19, .57, -.03], [2, -.08, .73, -.02]]) {
            const center = new THREE.Vector3(x, y, z), root = trunk.getPoint(.36 + tier * .23);
            group.add(stem(new THREE.CatmullRomCurve3([root, root.clone().lerp(center, .58).add(new THREE.Vector3(0, -.025, 0)), center]), .015, barkMaterial));
            for (let twig = 0; twig < 7; twig++) {
                const angle = twig * 2.4 + phase + tier, radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                const tip = center.clone().addScaledVector(radial, .13 + (twig % 2) * .035);
                tip.y += .015 + (twig % 3) * .014;
                group.add(stem(new THREE.CatmullRomCurve3([center, center.clone().lerp(tip, .55), tip]), .006, barkMaterial));
                for (let l = 0; l < 3; l++) {
                    const point = center.clone().lerp(tip, .6 + l * .22), direction = radial.clone();
                    direction.y = .25 + (l % 2) * .2;
                    point.z += (l - 1) * .017;
                    aimLeaf(pose, point, direction, .115 + (l % 2) * .030, 1.1);
                    leaves.setMatrixAt(placed, pose.matrix);
                    leaves.setColorAt(placed, greens[(twig + l + tier) % 3]);
                    veins.setMatrixAt(placed, pose.matrix);
                    placed++;
                }
            }
        }
        for (const mesh of [leaves, veins]) {
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.computeBoundingSphere();
            group.add(mesh);
        }
        return { group, update(time: number, reduced: boolean) { group.rotation.z = pothosSway(time * .7, phase, reduced) * .4; } };
    }
    return { trailing, fronds, broadleaf, bonsai };
}
