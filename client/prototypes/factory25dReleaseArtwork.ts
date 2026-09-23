import gameplayClip from '../../docs/evidence/changelog/2026-09-12-basketball.webm';
import gameplay from '../../docs/evidence/changelog/2026-09-12-basketball.png';
import personalSpace from '../../docs/evidence/changelog/2026-09-10.png';
import island from '../../docs/evidence/changelog/2026-09-08.png';
import roomLife from '../../docs/evidence/changelog/2026-09-07.png';
import garage from '../../docs/evidence/changelog/2026-09-06.png';
import patio from '../../docs/evidence/changelog/2026-09-05.png';
import original from '../../docs/evidence/changelog/2026-03-25.png';

/** Original captures stay intact; feature frames use source-pixel bounds without stretching. */
const captures: Record<string, {src:string; alt:string; width:number; height:number; frame?: {x:number; y:number; width:number; height:number}}> = {
  '2026-09-11-games': {src:gameplay,alt:'A basketball shot at the window hoop, with agents and arcade cabinets in the factory',width:800,height:564},
  '2026-09-10-personal-space': {src:personalSpace,alt:'Close-up of two agents and the space between their workstations',width:1398,height:985,frame:{x:300,y:290,width:580,height:280}},
  '2026-09-08-island': {src:island,alt:'Close-up of the original navigation island and avatar control',width:1398,height:985,frame:{x:520,y:805,width:390,height:180}},
  '2026-09-07-room-life': {src:roomLife,alt:'Close-up of the whiteboard and its room attendant',width:1398,height:985,frame:{x:10,y:330,width:270,height:210}},
  '2026-09-06-garage': {src:garage,alt:'Close-up of the new garage cars and downstairs workstations',width:1398,height:985,frame:{x:290,y:125,width:960,height:360}},
  '2026-09-05-factory': {src:patio,alt:'Close-up of the outdoor garden terrace, workstations, and illuminated stairs',width:1398,height:985,frame:{x:145,y:240,width:980,height:450}},
  '2026-03-25-original': {src:original,alt:'The original March 25 factory: a neon arcade floor, front counter, and purple lounge',width:1600,height:960},
};

export function releaseArtwork(id: string, variant: 'full' | 'thumbnail' = 'full') {
  const capture = captures[id];
  if (!capture) return '';
  const thumbnail = variant === 'thumbnail';
  if (id === '2026-09-11-games' && !thumbnail) return `<span class="factory-update-art factory-release-video"><video data-src="${gameplayClip}" data-poster="${capture.src}" muted loop playsinline preload="none" aria-label="Recorded local HORSE basketball shot" width="${capture.width}" height="${capture.height}"></video><button type="button" class="factory-release-playback" aria-label="Pause basketball replay">Pause</button></span>`;
  const frame = capture.frame;
  const framing = frame ? ` style="position:relative;aspect-ratio:${frame.width}/${frame.height}"` : '';
  const imageFraming = frame ? ` style="position:absolute;max-width:none;width:${capture.width / frame.width * 100}%;left:${-frame.x / frame.width * 100}%;top:${-frame.y / frame.height * 100}%;height:auto"` : '';
  return `<span${framing} class="${thumbnail ? 'factory-release-thumbnail' : 'factory-update-art factory-release-capture'}"${thumbnail ? ' aria-hidden="true"' : ''}><img${imageFraming} src="${capture.src}" alt="${thumbnail ? '' : capture.alt}" loading="lazy" decoding="async" width="${capture.width}" height="${capture.height}"></span>`;
}
