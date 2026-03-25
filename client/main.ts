import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FactoryScene } from './scenes/FactoryScene';
import { UIScene } from './scenes/UIScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 480,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0a0a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, FactoryScene, UIScene],
};

new Phaser.Game(config);
