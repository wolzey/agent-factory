package designer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

const spriteSize = 16

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

// Grid is a 16x16 pixel canvas.
type Grid [spriteSize][spriteSize]Pixel

// fillRect fills a rectangle in the grid.
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

// DrawCharacter renders the idle frame 0 character onto a Grid.
func DrawCharacter(params AvatarParams) Grid {
	var g Grid

	skin := px(params.SkinTone)
	shirt := px(params.ShirtColor)
	darkShirt := darken(shirt, 0.6)
	lightShirt := lighten(shirt, 40)
	pants := px(params.PantsColor)
	shoes := px(params.ShoeColor)
	hair := px(params.HairColor)
	legColor := px("#334455")

	// Head (skin) - x+5, y+2, 6w, 5h
	g.fillRect(skin, 5, 2, 6, 5)

	// Hair/hat
	drawHairStyle(&g, params.HairStyle, hair, shirt)

	// Eyes
	eyeColor := px("#000000")
	g.fillRect(eyeColor, 6, 4, 1, 1)
	g.fillRect(eyeColor, 9, 4, 1, 1)

	// Mouth
	drawMouthStyle(&g, params.MouthStyle)

	// Facial hair
	drawFacialHairStyle(&g, params.FacialHair, hair)

	// Face accessory
	drawFaceAccessoryStyle(&g, params.FaceAccessory)

	// Head accessory (on top of hair)
	drawHeadAccessoryStyle(&g, params.HeadAccessory)

	// Shirt/body - x+4, y+7, 8w, 4h
	g.fillRect(shirt, 4, 7, 8, 4)

	// Shirt design
	drawShirtDesignStyle(&g, params.ShirtDesign, darkShirt, lightShirt)

	// Collar highlight - x+6, y+7, 4w, 1h
	g.fillRect(lightShirt, 6, 7, 4, 1)

	// Pants - x+4, y+11, 8w, 2h
	g.fillRect(pants, 4, 11, 8, 2)

	// Arms - x+3, y+8, 2w, 3h and x+11, y+8, 2w, 3h
	g.fillRect(darkShirt, 3, 8, 2, 3)
	g.fillRect(darkShirt, 11, 8, 2, 3)

	// Legs - x+5, y+13, 2w, 2h and x+9, y+13, 2w, 2h
	g.fillRect(legColor, 5, 13, 2, 2)
	g.fillRect(legColor, 9, 13, 2, 2)

	// Shoes - x+5, y+15, 2w, 1h and x+9, y+15, 2w, 1h
	g.fillRect(shoes, 5, 15, 2, 1)
	g.fillRect(shoes, 9, 15, 2, 1)

	return g
}

// drawHairStyle draws the appropriate hair style onto the grid.
// Matches BootScene.ts HAIR_STYLES exactly.
func drawHairStyle(g *Grid, style int, hair, body Pixel) {
	switch style % 8 {
	case 0: // Short flat
		g.fillRect(hair, 5, 2, 6, 2)
	case 1: // Spiky
		g.fillRect(hair, 5, 3, 6, 2)
		g.fillRect(hair, 6, 2, 1, 1)
		g.fillRect(hair, 8, 1, 1, 2)
		g.fillRect(hair, 10, 2, 1, 1)
	case 2: // Long sides
		g.fillRect(hair, 5, 2, 6, 3)
		g.fillRect(hair, 4, 4, 1, 4)
		g.fillRect(hair, 11, 4, 1, 4)
	case 3: // Cap/hat (uses body/shirt color)
		g.fillRect(body, 4, 2, 8, 3)
		g.fillRect(body, 3, 4, 10, 1)
	case 4: // Mohawk
		g.fillRect(hair, 7, 0, 2, 4)
		g.fillRect(hair, 5, 3, 6, 1)
	case 5: // Bald (skin highlight)
		highlight := px("#ffddb3")
		g.fillRect(highlight, 6, 2, 4, 1)
	case 6: // Afro
		g.fillRect(hair, 4, 1, 8, 4)
		g.fillRect(hair, 3, 2, 1, 2)
		g.fillRect(hair, 12, 2, 1, 2)
	case 7: // Bandana (body colored)
		g.fillRect(body, 4, 2, 8, 2)
		g.fillRect(body, 3, 3, 1, 1)
		g.fillRect(body, 12, 3, 1, 1)
	}
}

// drawMouthStyle draws the mouth onto the grid.
func drawMouthStyle(g *Grid, style int) {
	switch style % 6 {
	case 0: // Default (none)
	case 1: // Smile
		g.fillRect(px("#cc6666"), 7, 6, 2, 1)
	case 2: // Frown
		g.fillRect(px("#886666"), 7, 6, 2, 1)
	case 3: // Open
		g.fillRect(px("#331111"), 7, 5, 2, 1)
		g.fillRect(px("#cc6666"), 7, 6, 2, 1)
	case 4: // Teeth Grin
		g.fillRect(px("#ffffff"), 7, 6, 2, 1)
	case 5: // Tongue Out
		g.fillRect(px("#ff6699"), 7, 6, 2, 1)
	}
}

// drawFacialHairStyle draws facial hair onto the grid.
func drawFacialHairStyle(g *Grid, style int, hair Pixel) {
	faded := Pixel{hair.R, hair.G, hair.B, 128}
	switch style % 6 {
	case 0: // None
	case 1: // Stubble
		g.fillRect(faded, 6, 6, 1, 1)
		g.fillRect(faded, 8, 6, 1, 1)
		g.fillRect(faded, 9, 5, 1, 1)
	case 2: // Mustache
		g.fillRect(hair, 6, 5, 4, 1)
	case 3: // Full Beard
		g.fillRect(hair, 5, 5, 6, 2)
		g.fillRect(hair, 6, 7, 4, 1)
	case 4: // Goatee
		g.fillRect(hair, 7, 5, 2, 2)
	case 5: // Soul Patch
		g.fillRect(hair, 7, 6, 2, 1)
	}
}

// drawFaceAccessoryStyle draws face accessories onto the grid.
func drawFaceAccessoryStyle(g *Grid, style int) {
	switch style % 6 {
	case 0: // None
	case 1: // Round Glasses
		frame := px("#666666")
		g.fillRect(frame, 5, 3, 3, 1)
		g.fillRect(frame, 5, 5, 3, 1)
		g.fillRect(frame, 5, 4, 1, 1)
		g.fillRect(frame, 7, 4, 1, 1)
		g.fillRect(frame, 8, 3, 3, 1)
		g.fillRect(frame, 8, 5, 3, 1)
		g.fillRect(frame, 8, 4, 1, 1)
		g.fillRect(frame, 10, 4, 1, 1)
		// Bridge
		g.fillRect(frame, 7, 4, 1, 1)
	case 2: // Sunglasses
		dark := px("#111111")
		g.fillRect(dark, 5, 4, 3, 2)
		g.fillRect(dark, 8, 4, 3, 2)
		bridge := px("#333333")
		g.fillRect(bridge, 7, 4, 2, 1)
	case 3: // Monocle
		gold := px("#ccaa44")
		g.fillRect(gold, 8, 3, 3, 1)
		g.fillRect(gold, 8, 5, 3, 1)
		g.fillRect(gold, 8, 4, 1, 1)
		g.fillRect(gold, 10, 4, 1, 1)
		// Chain
		g.fillRect(gold, 10, 6, 1, 2)
	case 4: // Eye Patch
		patch := px("#222222")
		g.fillRect(patch, 5, 3, 3, 3)
		// Strap
		g.fillRect(patch, 4, 2, 1, 1)
		g.fillRect(patch, 8, 2, 4, 1)
	case 5: // Visor
		visor := pxAlpha("#00ffff", 180)
		g.fillRect(visor, 4, 4, 8, 2)
	}
}

// drawHeadAccessoryStyle draws head accessories onto the grid.
func drawHeadAccessoryStyle(g *Grid, style int) {
	switch style % 7 {
	case 0: // None
	case 1: // Crown
		gold := px("#ffd700")
		g.fillRect(gold, 5, 1, 6, 2)
		// Peaks
		g.fillRect(gold, 5, 0, 1, 1)
		g.fillRect(gold, 7, 0, 1, 1)
		g.fillRect(gold, 10, 0, 1, 1)
		// Gems
		g.fillRect(px("#ff0000"), 6, 1, 1, 1)
		g.fillRect(px("#0044ff"), 9, 1, 1, 1)
	case 2: // Top Hat
		black := px("#111111")
		g.fillRect(black, 6, 0, 4, 2)
		// Brim
		g.fillRect(black, 4, 2, 8, 1)
		// Band
		g.fillRect(px("#cc0000"), 6, 1, 4, 1)
	case 3: // Halo
		gold := px("#ffdd44")
		g.fillRect(gold, 6, 0, 4, 1)
		g.fillRect(gold, 5, 1, 1, 1)
		g.fillRect(gold, 10, 1, 1, 1)
	case 4: // Devil Horns
		red := px("#cc0000")
		g.fillRect(red, 4, 1, 2, 2)
		g.fillRect(red, 10, 1, 2, 2)
		g.fillRect(red, 4, 0, 1, 1)
		g.fillRect(red, 11, 0, 1, 1)
	case 5: // Antenna
		g.fillRect(px("#888888"), 8, 0, 1, 2)
		g.fillRect(px("#00ff00"), 8, 0, 1, 1)
	case 6: // Flower
		pink := px("#ff69b4")
		g.fillRect(pink, 10, 2, 3, 1)
		g.fillRect(pink, 10, 4, 3, 1)
		g.fillRect(pink, 10, 3, 1, 1)
		g.fillRect(pink, 12, 3, 1, 1)
		g.fillRect(px("#ffff00"), 11, 3, 1, 1)
	}
}

// drawShirtDesignStyle draws shirt designs onto the grid.
func drawShirtDesignStyle(g *Grid, style int, darkShirt, lightShirt Pixel) {
	switch style % 7 {
	case 0: // Solid (none)
	case 1: // H-Stripe
		g.fillRect(darkShirt, 4, 9, 8, 1)
	case 2: // V-Stripe
		g.fillRect(lightShirt, 7, 8, 2, 3)
	case 3: // Heart
		red := px("#ff0000")
		g.fillRect(red, 6, 8, 1, 1)
		g.fillRect(red, 9, 8, 1, 1)
		g.fillRect(red, 6, 9, 4, 1)
		g.fillRect(red, 7, 10, 2, 1)
	case 4: // Star
		yellow := px("#ffff00")
		g.fillRect(yellow, 7, 8, 2, 1)
		g.fillRect(yellow, 6, 9, 4, 1)
		g.fillRect(yellow, 7, 10, 2, 1)
	case 5: // Number 1
		white := px("#ffffff")
		g.fillRect(white, 7, 8, 2, 3)
		g.fillRect(white, 6, 8, 1, 1)
	case 6: // Skull
		white := px("#ffffff")
		g.fillRect(white, 7, 8, 2, 2)
		g.fillRect(px("#000000"), 7, 8, 1, 1)
		g.fillRect(px("#000000"), 8, 8, 1, 1)
		g.fillRect(white, 7, 10, 2, 1)
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
