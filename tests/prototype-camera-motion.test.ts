import { describe, expect, it } from 'vitest';
import { OrthographicCamera } from 'three';
import { blendCamera, cameraEase, cameraPose } from '../client/prototypes/factory25dCameraMotion';
import { highlightChatMessage, chatUserColor } from '../client/ui/chatMessage';

describe('board and window camera motion', () => {
  it('lands on the saved room framing after an interrupted trip, including non-unit zoom', () => {
    const room = new OrthographicCamera(-8, 8, 5.64, -5.64, 0.1, 50);
    room.position.set(0, 9, 14.6); room.lookAt(0, 0.35, 0.45); room.zoom = 1.2;
    const saved = cameraPose(room);
    const close = room.clone(); close.position.set(4, 1, 6); close.lookAt(4, 1, 5); close.zoom = 8;
    const camera = room.clone();
    blendCamera(camera, saved, cameraPose(close), 0.35, 16 / 9);
    const interrupted = cameraPose(camera);
    blendCamera(camera, interrupted, saved, 1, 16 / 11.28);
    expect(camera.position.distanceTo(saved.position)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(saved.quaternion)).toBeLessThan(1e-6);
    expect(cameraPose(camera).height).toBeCloseTo(saved.height);
  });
  it('uses a symmetric settle and geometric scale at the midpoint', () => {
    expect(cameraEase(-1)).toBe(0); expect(cameraEase(2)).toBe(1);
    expect(cameraEase(0.2)).toBeCloseTo(1 - cameraEase(0.8));
    const camera = new OrthographicCamera(); const pose = cameraPose(camera);
    blendCamera(camera, { ...pose, height: 16 }, { ...pose, height: 1 }, 0.5, 2);
    expect(camera.top - camera.bottom).toBeCloseTo(4);
    expect(camera.right - camera.left).toBeCloseTo(8);
  });
});

it('renders chat markup as text while retaining the existing mention and command highlights', () => {
  const output = highlightChatMessage('<img src=x onerror=alert(1)> @Ada /help :wave: &');
  expect(output).not.toContain('<img');
  expect(output).toContain('&lt;img');
  expect(output).toContain('<span class="hl-mention">@Ada</span>');
  expect(output).toContain('<span class="hl-cmd">/help</span>');
  expect(output).toContain('<span class="hl-emote">:wave:</span>');
  expect(chatUserColor('Ada')).toBe(chatUserColor('Ada'));
});
