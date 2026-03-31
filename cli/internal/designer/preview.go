package designer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

const spriteSize = 32

// Pixel represents an RGBA pixel; zero-value is transparent.
type Pixel struct {
	R, G, B uint8
	A       uint8 // 0 = transparent
}

func px(hex string) Pixel {
	r, g, b := hexToRGB(hex)
	return Pixel{r, g, b, 255}
}

func pxAlpha(hex string, a uint8) Pixel {
	r, g, b := hexToRGB(hex)
	return Pixel{r, g, b, a}
}

func pxRGBA(r, g, b, a uint8) Pixel {
	return Pixel{r, g, b, a}
}

func hexToRGB(hex string) (uint8, uint8, uint8) {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return 0, 0, 0
	}
	var r, g, b uint8
	fmt.Sscanf(hex, "%02x%02x%02x", &r, &g, &b)
	return r, g, b
}

func darken(p Pixel, factor float64) Pixel {
	return Pixel{
		R: uint8(float64(p.R) * factor),
		G: uint8(float64(p.G) * factor),
		B: uint8(float64(p.B) * factor),
		A: p.A,
	}
}

func lighten(p Pixel, amount uint8) Pixel {
	addClamp := func(v, a uint8) uint8 {
		sum := int(v) + int(a)
		if sum > 255 {
			return 255
		}
		return uint8(sum)
	}
	return Pixel{
		R: addClamp(p.R, amount),
		G: addClamp(p.G, amount),
		B: addClamp(p.B, amount),
		A: p.A,
	}
}

// blendOver composites src over dst using standard alpha-over.
func blendOver(src, dst Pixel) Pixel {
	if src.A == 255 {
		return src
	}
	if src.A == 0 {
		return dst
	}
	sa := float64(src.A) / 255.0
	da := float64(dst.A) / 255.0
	outA := sa + da*(1-sa)
	if outA == 0 {
		return Pixel{}
	}
	blend := func(s, d uint8) uint8 {
		v := (float64(s)*sa + float64(d)*da*(1-sa)) / outA
		if v > 255 {
			return 255
		}
		return uint8(v)
	}
	return Pixel{
		R: blend(src.R, dst.R),
		G: blend(src.G, dst.G),
		B: blend(src.B, dst.B),
		A: uint8(outA * 255),
	}
}

// AvatarParams holds all the customization values for rendering a preview.
type AvatarParams struct {
	HairStyle     int
	HairColor     string
	SkinTone      string
	ShirtColor    string
	PantsColor    string
	ShoeColor     string
	FacialHair    int
	MouthStyle    int
	FaceAccessory int
	HeadAccessory int
	ShirtDesign   int
}

// Grid is a 32x32 pixel canvas.
type Grid [spriteSize][spriteSize]Pixel

// fillRect fills a rectangle in the grid (opaque overwrite).
func (g *Grid) fillRect(p Pixel, x, y, w, h int) {
	for dy := 0; dy < h; dy++ {
		for dx := 0; dx < w; dx++ {
			px, py := x+dx, y+dy
			if px >= 0 && px < spriteSize && py >= 0 && py < spriteSize {
				g[py][px] = p
			}
		}
	}
}

// fillRectAlpha fills a rectangle with alpha compositing over existing pixels.
func (g *Grid) fillRectAlpha(p Pixel, x, y, w, h int) {
	if p.A == 255 {
		g.fillRect(p, x, y, w, h)
		return
	}
	if p.A == 0 {
		return
	}
	for dy := 0; dy < h; dy++ {
		for dx := 0; dx < w; dx++ {
			px, py := x+dx, y+dy
			if px >= 0 && px < spriteSize && py >= 0 && py < spriteSize {
				g[py][px] = blendOver(p, g[py][px])
			}
		}
	}
}

// DrawCharacter renders the idle frame 0 character onto a Grid.
// Matches BootScene.ts drawCharacter() for anim="idle", frame=0.
func DrawCharacter(params AvatarParams) Grid {
	var g Grid

	skin := px(params.SkinTone)
	shirt := px(params.ShirtColor)
	shirtInt := hexToInt(params.ShirtColor)
	r := (shirtInt >> 16) & 0xff
	gr := (shirtInt >> 8) & 0xff
	b := shirtInt & 0xff
	darkShirt := Pixel{uint8(float64(r) * 0.6), uint8(float64(gr) * 0.6), uint8(float64(b) * 0.6), 255}
	lightShirt := Pixel{clampAdd(uint8(r), 40), clampAdd(uint8(gr), 40), clampAdd(uint8(b), 40), 255}
	pants := px(params.PantsColor)
	shoes := px(params.ShoeColor)
	hair := px(params.HairColor)

	// ── Head (skin) — rounded shape ──
	g.fillRect(skin, 11, 4, 10, 10)
	g.fillRect(skin, 10, 5, 12, 8)
	// Ears
	g.fillRect(skin, 9, 7, 1, 3)
	g.fillRect(skin, 22, 7, 1, 3)
	// Head shading (right side + ear)
	g.fillRectAlpha(pxRGBA(0, 0, 0, 20), 20, 5, 2, 8)
	g.fillRectAlpha(pxRGBA(0, 0, 0, 20), 22, 8, 1, 2)
	// Chin highlight
	g.fillRectAlpha(pxRGBA(255, 255, 255, 15), 13, 12, 6, 1)

	// ── Hair / hat ──
	drawHairStyle(&g, params.HairStyle, hair, shirt)

	// ── Eyes ──
	// Eye whites
	g.fillRect(px("#ffffff"), 12, 8, 3, 3)
	g.fillRect(px("#ffffff"), 18, 8, 3, 3)
	// Iris
	g.fillRect(px("#4466aa"), 13, 8, 2, 3)
	g.fillRect(px("#4466aa"), 19, 8, 2, 3)
	// Pupil
	g.fillRect(px("#000000"), 13, 9, 2, 1)
	g.fillRect(px("#000000"), 19, 9, 2, 1)
	// Highlight
	g.fillRect(px("#ffffff"), 14, 8, 1, 1)
	g.fillRect(px("#ffffff"), 20, 8, 1, 1)

	// ── Nose (subtle shadow) ──
	g.fillRectAlpha(pxRGBA(0, 0, 0, 31), 16, 10, 1, 2)

	// ── Mouth ──
	drawMouthStyle(&g, params.MouthStyle)

	// ── Facial hair ──
	drawFacialHairStyle(&g, params.FacialHair, hair)

	// ── Face accessory ──
	drawFaceAccessoryStyle(&g, params.FaceAccessory)

	// ── Head accessory (on top of hair) ──
	drawHeadAccessoryStyle(&g, params.HeadAccessory)

	// ── Neck ──
	g.fillRect(skin, 14, 14, 4, 2)
	g.fillRectAlpha(pxRGBA(0, 0, 0, 26), 17, 14, 1, 2)

	// ── Shirt / body ──
	g.fillRect(shirt, 8, 15, 16, 8)
	// Body shading (right side)
	g.fillRect(darkShirt, 22, 15, 2, 8)
	// Body highlight (left side)
	g.fillRect(lightShirt, 8, 16, 1, 4)
	// Collar
	g.fillRect(lightShirt, 12, 15, 8, 1)

	// ── Shirt design ──
	drawShirtDesignStyle(&g, params.ShirtDesign, darkShirt, lightShirt)

	// ── Belt ──
	g.fillRect(px("#443322"), 8, 22, 16, 1)
	// Belt buckle
	g.fillRect(px("#887744"), 15, 22, 2, 1)

	// ── Pants ──
	g.fillRect(pants, 8, 23, 16, 4)

	// ── Arms (idle: no swing) ──
	g.fillRect(darkShirt, 5, 16, 4, 6)
	g.fillRect(darkShirt, 23, 16, 4, 6)
	// Hands
	g.fillRect(skin, 5, 21, 3, 2)
	g.fillRect(skin, 24, 21, 3, 2)

	// ── Legs ──
	g.fillRect(pants, 10, 27, 4, 3)
	g.fillRect(pants, 18, 27, 4, 3)

	// ── Shoes ──
	g.fillRect(shoes, 9, 30, 5, 2)
	g.fillRect(shoes, 17, 30, 5, 2)
	// Shoe soles
	g.fillRect(px("#111111"), 9, 31, 5, 1)
	g.fillRect(px("#111111"), 17, 31, 5, 1)

	return g
}

// drawHairStyle draws the appropriate hair style onto the grid.
// Matches BootScene.ts HAIR_STYLES exactly (idle frame 0, bounce=0, hairY=4).
func drawHairStyle(g *Grid, style int, hair, body Pixel) {
	switch style % 8 {
	case 0: // Short flat
		g.fillRect(hair, 10, 4, 12, 4)
		g.fillRect(hair, 9, 5, 1, 3)
		g.fillRect(hair, 22, 5, 1, 3)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 31), 13, 5, 6, 1)
	case 1: // Spiky
		g.fillRect(hair, 10, 6, 12, 3)
		g.fillRect(hair, 11, 4, 2, 2)
		g.fillRect(hair, 15, 2, 2, 4)
		g.fillRect(hair, 19, 3, 2, 3)
		g.fillRect(hair, 13, 5, 2, 1)
		g.fillRect(hair, 17, 4, 1, 2)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 26), 15, 3, 1, 2)
	case 2: // Long sides
		g.fillRect(hair, 10, 4, 12, 5)
		g.fillRect(hair, 8, 8, 2, 8)
		g.fillRect(hair, 22, 8, 2, 8)
		g.fillRect(hair, 9, 6, 1, 4)
		g.fillRect(hair, 22, 6, 1, 4)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 20), 13, 5, 6, 2)
	case 3: // Cap/hat (uses body/shirt color)
		g.fillRect(body, 8, 4, 16, 5)
		g.fillRect(body, 6, 8, 20, 2)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 38), 10, 5, 8, 2)
		g.fillRectAlpha(pxRGBA(0, 0, 0, 38), 6, 9, 20, 1)
	case 4: // Mohawk
		g.fillRect(hair, 14, 0, 4, 8)
		g.fillRect(hair, 13, 2, 6, 2)
		g.fillRect(hair, 10, 6, 12, 2)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 26), 15, 1, 2, 4)
	case 5: // Bald (skin highlight)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 51), 12, 4, 8, 2)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 51), 14, 3, 4, 1)
	case 6: // Afro
		g.fillRect(hair, 8, 2, 16, 8)
		g.fillRect(hair, 6, 4, 2, 4)
		g.fillRect(hair, 24, 4, 2, 4)
		g.fillRect(hair, 7, 3, 1, 3)
		g.fillRect(hair, 24, 3, 1, 3)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 26), 12, 3, 6, 2)
	case 7: // Bandana (body colored)
		g.fillRect(body, 8, 4, 16, 4)
		g.fillRect(body, 6, 6, 2, 2)
		g.fillRect(body, 24, 6, 2, 2)
		g.fillRect(body, 24, 7, 3, 2)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 38), 12, 5, 8, 1)
	}
}

// drawMouthStyle draws the mouth onto the grid.
// Matches BootScene.ts MOUTH_STYLES (bounce=0).
func drawMouthStyle(g *Grid, style int) {
	switch style % 6 {
	case 0: // Default (none)
	case 1: // Smile
		g.fillRect(px("#cc6666"), 14, 12, 4, 1)
		g.fillRect(px("#cc6666"), 13, 11, 1, 1)
		g.fillRect(px("#cc6666"), 18, 11, 1, 1)
	case 2: // Frown
		g.fillRect(px("#886666"), 14, 11, 4, 1)
		g.fillRect(px("#886666"), 13, 12, 1, 1)
		g.fillRect(px("#886666"), 18, 12, 1, 1)
	case 3: // Open
		g.fillRect(px("#331111"), 14, 11, 4, 2)
		g.fillRect(px("#cc6666"), 14, 12, 4, 1)
	case 4: // Teeth Grin
		g.fillRect(px("#ffffff"), 14, 12, 4, 1)
		g.fillRect(px("#dddddd"), 16, 12, 1, 1)
	case 5: // Tongue Out
		g.fillRect(px("#cc6666"), 14, 12, 4, 1)
		g.fillRect(px("#ff6699"), 15, 13, 2, 1)
	}
}

// drawFacialHairStyle draws facial hair onto the grid.
// Matches BootScene.ts FACIAL_HAIR_STYLES (bounce=0).
func drawFacialHairStyle(g *Grid, style int, hair Pixel) {
	hairAlpha := Pixel{hair.R, hair.G, hair.B, 102} // globalAlpha 0.4
	switch style % 6 {
	case 0: // None
	case 1: // Stubble
		g.fillRectAlpha(hairAlpha, 12, 12, 1, 1)
		g.fillRectAlpha(hairAlpha, 14, 13, 1, 1)
		g.fillRectAlpha(hairAlpha, 17, 13, 1, 1)
		g.fillRectAlpha(hairAlpha, 19, 12, 1, 1)
		g.fillRectAlpha(hairAlpha, 16, 12, 1, 1)
	case 2: // Mustache
		g.fillRect(hair, 12, 11, 8, 1)
		g.fillRect(hair, 13, 10, 2, 1)
		g.fillRect(hair, 17, 10, 2, 1)
	case 3: // Full Beard
		g.fillRect(hair, 10, 11, 12, 3)
		g.fillRect(hair, 12, 14, 8, 2)
		g.fillRect(hair, 14, 16, 4, 1)
	case 4: // Goatee
		g.fillRect(hair, 14, 11, 4, 3)
		g.fillRect(hair, 15, 14, 2, 1)
	case 5: // Soul Patch
		g.fillRect(hair, 15, 13, 2, 2)
	}
}

// drawFaceAccessoryStyle draws face accessories onto the grid.
// Matches BootScene.ts FACE_ACCESSORIES (bounce=0, eyeY=8).
func drawFaceAccessoryStyle(g *Grid, style int) {
	switch style % 6 {
	case 0: // None
	case 1: // Round Glasses
		frame := px("#666666")
		// Left lens frame
		g.fillRect(frame, 10, 7, 5, 1)
		g.fillRect(frame, 10, 11, 5, 1)
		g.fillRect(frame, 10, 8, 1, 3)
		g.fillRect(frame, 14, 8, 1, 3)
		// Right lens frame
		g.fillRect(frame, 17, 7, 5, 1)
		g.fillRect(frame, 17, 11, 5, 1)
		g.fillRect(frame, 17, 8, 1, 3)
		g.fillRect(frame, 21, 8, 1, 3)
		// Bridge
		g.fillRect(frame, 14, 8, 3, 1)
		// Lens tint
		g.fillRectAlpha(pxRGBA(200, 220, 255, 38), 11, 8, 3, 3)
		g.fillRectAlpha(pxRGBA(200, 220, 255, 38), 18, 8, 3, 3)
	case 2: // Sunglasses
		dark := px("#111111")
		g.fillRect(dark, 10, 8, 5, 3)
		g.fillRect(dark, 17, 8, 5, 3)
		g.fillRect(px("#333333"), 15, 8, 2, 1)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 51), 11, 8, 2, 1)
		g.fillRectAlpha(pxRGBA(255, 255, 255, 51), 18, 8, 2, 1)
	case 3: // Monocle
		gold := px("#ccaa44")
		g.fillRect(gold, 17, 7, 5, 1)
		g.fillRect(gold, 17, 11, 5, 1)
		g.fillRect(gold, 17, 8, 1, 3)
		g.fillRect(gold, 21, 8, 1, 3)
		// Chain
		g.fillRect(gold, 21, 12, 1, 4)
		g.fillRect(gold, 22, 14, 1, 2)
	case 4: // Eye Patch
		patch := px("#222222")
		g.fillRect(patch, 10, 7, 5, 5)
		// Strap
		g.fillRect(px("#333333"), 8, 5, 2, 2)
		g.fillRect(px("#333333"), 16, 5, 8, 1)
	case 5: // Visor
		g.fillRectAlpha(pxRGBA(0, 255, 255, 179), 8, 8, 16, 3)
		g.fillRect(px("#008888"), 8, 8, 16, 1)
	}
}

// drawHeadAccessoryStyle draws head accessories onto the grid.
// Matches BootScene.ts HEAD_ACCESSORIES (bounce=0).
func drawHeadAccessoryStyle(g *Grid, style int) {
	switch style % 7 {
	case 0: // None
	case 1: // Crown
		gold := px("#ffd700")
		g.fillRect(gold, 10, 2, 12, 4)
		g.fillRect(gold, 10, 0, 2, 2)
		g.fillRect(gold, 14, -1, 2, 3)
		g.fillRect(gold, 20, 0, 2, 2)
		// Gems
		g.fillRect(px("#ff0000"), 12, 2, 2, 2)
		g.fillRect(px("#0044ff"), 18, 2, 2, 2)
		// Highlight
		g.fillRectAlpha(pxRGBA(255, 255, 255, 51), 12, 1, 8, 1)
	case 2: // Top Hat
		black := px("#111111")
		g.fillRect(black, 12, -4, 8, 6)
		g.fillRect(black, 8, 2, 16, 2)
		// Band
		g.fillRect(px("#cc0000"), 12, 0, 8, 2)
		// Highlight
		g.fillRectAlpha(pxRGBA(255, 255, 255, 26), 13, -3, 2, 4)
	case 3: // Halo
		gold := px("#ffdd44")
		g.fillRect(gold, 12, -1, 8, 1)
		g.fillRect(gold, 10, 0, 2, 2)
		g.fillRect(gold, 20, 0, 2, 2)
		g.fillRect(gold, 12, 2, 8, 1)
		// Glow
		g.fillRectAlpha(pxRGBA(255, 255, 100, 77), 13, 0, 6, 2)
	case 4: // Devil Horns
		red := px("#cc0000")
		g.fillRect(red, 8, 2, 4, 4)
		g.fillRect(red, 20, 2, 4, 4)
		g.fillRect(red, 8, 0, 2, 2)
		g.fillRect(red, 22, 0, 2, 2)
		// Dark tips
		g.fillRect(px("#880000"), 8, 1, 1, 1)
		g.fillRect(px("#880000"), 23, 1, 1, 1)
	case 5: // Antenna
		g.fillRect(px("#888888"), 16, -2, 1, 6)
		g.fillRect(px("#888888"), 15, -1, 3, 1)
		g.fillRect(px("#00ff00"), 15, -4, 3, 3)
		g.fillRectAlpha(pxRGBA(0, 255, 0, 77), 14, -5, 5, 5)
	case 6: // Flower
		// Stem
		g.fillRect(px("#22aa22"), 21, 6, 1, 3)
		// Petals
		pink := px("#ff69b4")
		g.fillRect(pink, 20, 4, 3, 1)
		g.fillRect(pink, 20, 8, 3, 1)
		g.fillRect(pink, 19, 5, 1, 3)
		g.fillRect(pink, 23, 5, 1, 3)
		// Center
		g.fillRect(px("#ffff00"), 20, 5, 3, 3)
	}
}

// drawShirtDesignStyle draws shirt designs onto the grid.
// Matches BootScene.ts SHIRT_DESIGNS (bounce=0, breathe=0) + new designs.
func drawShirtDesignStyle(g *Grid, style int, darkShirt, lightShirt Pixel) {
	switch style % 12 {
	case 0: // Solid (none)
	case 1: // H-Stripe
		g.fillRect(darkShirt, 8, 18, 16, 2)
	case 2: // V-Stripe
		g.fillRect(lightShirt, 14, 16, 4, 6)
	case 3: // Heart
		red := px("#ff0000")
		g.fillRect(red, 12, 16, 3, 2)
		g.fillRect(red, 17, 16, 3, 2)
		g.fillRect(red, 11, 18, 10, 2)
		g.fillRect(red, 13, 20, 6, 1)
		g.fillRect(red, 15, 21, 2, 1)
	case 4: // Star
		yellow := px("#ffff00")
		g.fillRect(yellow, 15, 16, 2, 1)
		g.fillRect(yellow, 12, 17, 8, 2)
		g.fillRect(yellow, 14, 19, 4, 1)
		g.fillRect(yellow, 13, 20, 2, 1)
		g.fillRect(yellow, 17, 20, 2, 1)
	case 5: // Number 1
		white := px("#ffffff")
		g.fillRect(white, 15, 16, 2, 5)
		g.fillRect(white, 13, 16, 2, 2)
		g.fillRect(white, 13, 21, 6, 1)
	case 6: // Skull
		white := px("#ffffff")
		g.fillRect(white, 13, 16, 6, 4)
		g.fillRect(px("#000000"), 14, 17, 2, 2)
		g.fillRect(px("#000000"), 17, 17, 2, 2)
		g.fillRect(white, 14, 20, 4, 1)
		g.fillRect(px("#000000"), 15, 20, 1, 1)
		g.fillRect(px("#000000"), 17, 20, 1, 1)
	case 7: // Checkerboard
		g.fillRect(darkShirt, 8, 16, 2, 2)
		g.fillRect(darkShirt, 12, 16, 2, 2)
		g.fillRect(darkShirt, 16, 16, 2, 2)
		g.fillRect(darkShirt, 20, 16, 2, 2)
		g.fillRect(darkShirt, 10, 18, 2, 2)
		g.fillRect(darkShirt, 14, 18, 2, 2)
		g.fillRect(darkShirt, 18, 18, 2, 2)
		g.fillRect(darkShirt, 22, 18, 2, 2)
		g.fillRect(darkShirt, 8, 20, 2, 2)
		g.fillRect(darkShirt, 12, 20, 2, 2)
		g.fillRect(darkShirt, 16, 20, 2, 2)
		g.fillRect(darkShirt, 20, 20, 2, 2)
	case 8: // Diamond
		white := px("#ffffff")
		g.fillRect(white, 15, 16, 2, 1)
		g.fillRect(white, 14, 17, 4, 1)
		g.fillRect(white, 13, 18, 6, 1)
		g.fillRect(white, 14, 19, 4, 1)
		g.fillRect(white, 15, 20, 2, 1)
	case 9: // Lightning
		yellow := px("#ffff00")
		g.fillRect(yellow, 16, 16, 3, 1)
		g.fillRect(yellow, 15, 17, 3, 1)
		g.fillRect(yellow, 14, 18, 3, 1)
		g.fillRect(yellow, 15, 19, 3, 1)
		g.fillRect(yellow, 16, 20, 3, 1)
		g.fillRect(yellow, 15, 21, 3, 1)
	case 10: // Dots
		g.fillRect(lightShirt, 10, 16, 1, 1)
		g.fillRect(lightShirt, 14, 16, 1, 1)
		g.fillRect(lightShirt, 18, 16, 1, 1)
		g.fillRect(lightShirt, 22, 16, 1, 1)
		g.fillRect(lightShirt, 12, 18, 1, 1)
		g.fillRect(lightShirt, 16, 18, 1, 1)
		g.fillRect(lightShirt, 20, 18, 1, 1)
		g.fillRect(lightShirt, 10, 20, 1, 1)
		g.fillRect(lightShirt, 14, 20, 1, 1)
		g.fillRect(lightShirt, 18, 20, 1, 1)
		g.fillRect(lightShirt, 22, 20, 1, 1)
	case 11: // X-Cross
		white := px("#ffffff")
		g.fillRect(white, 10, 16, 2, 1)
		g.fillRect(white, 20, 16, 2, 1)
		g.fillRect(white, 12, 17, 2, 1)
		g.fillRect(white, 18, 17, 2, 1)
		g.fillRect(white, 14, 18, 4, 2)
		g.fillRect(white, 12, 20, 2, 1)
		g.fillRect(white, 18, 20, 2, 1)
		g.fillRect(white, 10, 21, 2, 1)
		g.fillRect(white, 20, 21, 2, 1)
	}
}

// RenderPreview renders a Grid to a styled string using half-block characters.
// Each terminal line represents 2 pixel rows. Scale doubles each pixel horizontally.
func RenderPreview(g Grid, scale int) string {
	var sb strings.Builder

	for row := 0; row < spriteSize; row += 2 {
		for col := 0; col < spriteSize; col++ {
			top := g[row][col]
			bot := g[row+1][col]

			char := "▀"
			style := lipgloss.NewStyle()

			if top.A == 0 && bot.A == 0 {
				// Both transparent
				char = " "
			} else if top.A == 0 {
				// Only bottom visible - use lower half block
				char = "▄"
				style = style.Foreground(lipgloss.Color(toHex(bot)))
			} else if bot.A == 0 {
				// Only top visible - use upper half block
				char = "▀"
				style = style.Foreground(lipgloss.Color(toHex(top)))
			} else {
				// Both visible - upper half block with fg=top, bg=bottom
				char = "▀"
				style = style.
					Foreground(lipgloss.Color(toHex(top))).
					Background(lipgloss.Color(toHex(bot)))
			}

			rendered := style.Render(char)
			for s := 0; s < scale; s++ {
				sb.WriteString(rendered)
			}
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func toHex(p Pixel) string {
	return fmt.Sprintf("#%02x%02x%02x", p.R, p.G, p.B)
}

func hexToInt(hex string) int {
	hex = strings.TrimPrefix(hex, "#")
	var val int
	fmt.Sscanf(hex, "%x", &val)
	return val
}

func clampAdd(v, a uint8) uint8 {
	sum := int(v) + int(a)
	if sum > 255 {
		return 255
	}
	return uint8(sum)
}
