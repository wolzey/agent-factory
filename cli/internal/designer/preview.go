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
	HairStyle  int
	HairColor  string
	SkinTone   string
	ShirtColor string
	PantsColor string
	ShoeColor  string
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

	// Shirt/body - x+4, y+7, 8w, 4h
	g.fillRect(shirt, 4, 7, 8, 4)

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

