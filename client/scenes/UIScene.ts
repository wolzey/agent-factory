import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene', active: false });
  }

  create() {
    // This scene runs on top of FactoryScene for HUD elements
    // Currently the HUD is DOM-based (in index.html), but this scene
    // can be used for Phaser-rendered overlays if needed later
  }
}
