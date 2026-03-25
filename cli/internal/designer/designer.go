package designer

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/wolzey/agent-factory/cli/internal/config"
)

const (
	fieldHairStyle = iota
	fieldHairColor
	fieldSkinTone
	fieldShirtColor
	fieldPantsColor
	fieldShoeColor
	fieldCount
)

var (
	titleStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ff00ff"))
	focusedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ffff")).Bold(true)
	normalStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))
	arrowStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff")).Bold(true)
	valueStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
	helpStyle     = lipgloss.NewStyle().Faint(true)
	borderStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff"))
	selectedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff66")).Bold(true)
)

// Model is the bubbletea model for the avatar designer.
type Model struct {
	fields     []Field
	focused    int
	selections [fieldCount]int
	confirmed  bool
	cancelled  bool
}

// Result holds the designer output.
type Result struct {
	Avatar    config.AvatarConfig
	Cancelled bool
}

// NewModel creates a new designer model, optionally pre-populated from existing config.
func NewModel(existing *config.AvatarConfig) Model {
	m := Model{
		fields: AllFields(),
	}

	if existing != nil {
		if existing.HairStyle != nil {
			m.selections[fieldHairStyle] = clampIdx(*existing.HairStyle, len(m.fields[fieldHairStyle].Options))
		}
		if existing.HairColor != nil {
			m.selections[fieldHairColor] = findColorIdx(HairColors, *existing.HairColor)
		}
		if existing.SkinTone != nil {
			m.selections[fieldSkinTone] = findColorIdx(SkinTones, *existing.SkinTone)
		}
		if existing.ShirtColor != nil {
			m.selections[fieldShirtColor] = findColorIdx(ShirtColors, *existing.ShirtColor)
		} else if existing.Color != "" {
			m.selections[fieldShirtColor] = findColorIdx(ShirtColors, existing.Color)
		}
		if existing.PantsColor != nil {
			m.selections[fieldPantsColor] = findColorIdx(PantsColors, *existing.PantsColor)
		}
		if existing.ShoeColor != nil {
			m.selections[fieldShoeColor] = findColorIdx(ShoeColors, *existing.ShoeColor)
		}
	}

	return m
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			m.focused--
			if m.focused < 0 {
				m.focused = fieldCount - 1
			}
		case "down", "j":
			m.focused++
			if m.focused >= fieldCount {
				m.focused = 0
			}
		case "left", "h":
			max := len(m.fields[m.focused].Options)
			m.selections[m.focused]--
			if m.selections[m.focused] < 0 {
				m.selections[m.focused] = max - 1
			}
		case "right", "l":
			max := len(m.fields[m.focused].Options)
			m.selections[m.focused]++
			if m.selections[m.focused] >= max {
				m.selections[m.focused] = 0
			}
		case "enter":
			m.confirmed = true
			return m, tea.Quit
		case "esc", "q":
			m.cancelled = true
			return m, tea.Quit
		case "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m Model) View() string {
	var sb strings.Builder

	// Title
	sb.WriteString("\n")
	sb.WriteString(borderStyle.Render("  ╔══════════════════════════════════════════════════╗") + "\n")
	sb.WriteString(borderStyle.Render("  ║") + titleStyle.Render("            ✦ AVATAR DESIGNER ✦              ") + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╠══════════════════════════════════════════════════╣") + "\n")
	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", 50) + borderStyle.Render("║") + "\n")

	// Render preview
	params := m.currentParams()
	grid := DrawCharacter(params)
	preview := RenderPreview(grid, 2)
	previewLines := strings.Split(strings.TrimRight(preview, "\n"), "\n")

	// Build option lines
	optionLines := make([]string, fieldCount)
	for i := 0; i < fieldCount; i++ {
		label := m.fields[i].Label
		value := m.fields[i].Options[m.selections[i]]

		var line string
		if i == m.focused {
			labelStr := focusedStyle.Render(fmt.Sprintf("%-12s", label))
			line = fmt.Sprintf("%s %s %s %s",
				labelStr,
				arrowStyle.Render("◀"),
				selectedStyle.Render(fmt.Sprintf("%-13s", value)),
				arrowStyle.Render("▶"),
			)
		} else {
			labelStr := normalStyle.Render(fmt.Sprintf("%-12s", label))
			line = fmt.Sprintf("%s   %s  ",
				labelStr,
				valueStyle.Render(fmt.Sprintf("%-13s", value)),
			)
		}
		optionLines[i] = line
	}

	// Combine preview (left) with options (right)
	// Preview is 8 lines tall, options are 6 lines — pad to match
	maxLines := 8
	for i := 0; i < maxLines; i++ {
		previewPart := "                                "
		if i < len(previewLines) {
			previewPart = fmt.Sprintf("%-32s", previewLines[i])
		}

		optionPart := ""
		if i < len(optionLines) {
			optionPart = optionLines[i]
		}

		// Assemble row inside border
		row := fmt.Sprintf("    %s  %s", previewPart, optionPart)
		// Pad to fit inside the border
		sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-50s", row) + borderStyle.Render("║") + "\n")
	}

	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", 50) + borderStyle.Render("║") + "\n")

	// Help line
	helpText := helpStyle.Render("    ↑↓ navigate   ◀▶ change   enter confirm   esc cancel")
	sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-50s", helpText) + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╚══════════════════════════════════════════════════╝") + "\n")

	return sb.String()
}

// GetResult returns the designed avatar config.
func (m Model) GetResult() Result {
	if m.cancelled {
		return Result{Cancelled: true}
	}

	hairStyle := m.selections[fieldHairStyle]
	hairColor := HairColors[m.selections[fieldHairColor]].Hex
	skinTone := SkinTones[m.selections[fieldSkinTone]].Hex
	shirtColor := ShirtColors[m.selections[fieldShirtColor]].Hex
	pantsColor := PantsColors[m.selections[fieldPantsColor]].Hex
	shoeColor := ShoeColors[m.selections[fieldShoeColor]].Hex

	return Result{
		Avatar: config.AvatarConfig{
			SpriteIndex: hairStyle, // keep spriteIndex in sync for backwards compat
			Color:       shirtColor,
			Hat:         nil,
			Trail:       nil,
			HairStyle:   &hairStyle,
			HairColor:   &hairColor,
			SkinTone:    &skinTone,
			ShirtColor:  &shirtColor,
			PantsColor:  &pantsColor,
			ShoeColor:   &shoeColor,
		},
	}
}

func (m Model) currentParams() AvatarParams {
	return AvatarParams{
		HairStyle:  m.selections[fieldHairStyle],
		HairColor:  HairColors[m.selections[fieldHairColor]].Hex,
		SkinTone:   SkinTones[m.selections[fieldSkinTone]].Hex,
		ShirtColor: ShirtColors[m.selections[fieldShirtColor]].Hex,
		PantsColor: PantsColors[m.selections[fieldPantsColor]].Hex,
		ShoeColor:  ShoeColors[m.selections[fieldShoeColor]].Hex,
	}
}

// Run launches the designer TUI and returns the result.
func Run(existing *config.AvatarConfig) (Result, error) {
	m := NewModel(existing)
	p := tea.NewProgram(m, tea.WithAltScreen())
	finalModel, err := p.Run()
	if err != nil {
		return Result{Cancelled: true}, err
	}
	return finalModel.(Model).GetResult(), nil
}

func clampIdx(val, max int) int {
	if val < 0 {
		return 0
	}
	if val >= max {
		return max - 1
	}
	return val
}

func findColorIdx(opts []ColorOption, hex string) int {
	hex = strings.ToLower(hex)
	for i, o := range opts {
		if strings.ToLower(o.Hex) == hex {
			return i
		}
	}
	return 0
}
