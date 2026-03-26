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
	fieldFacialHair
	fieldMouthStyle
	fieldFaceAccessory
	fieldHeadAccessory
	fieldShirtColor
	fieldShirtDesign
	fieldPantsColor
	fieldShoeColor
	fieldCount
)

const visibleFields = 8

var (
	titleStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ff00ff"))
	focusedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ffff")).Bold(true)
	normalStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))
	arrowStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff")).Bold(true)
	valueStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
	helpStyle     = lipgloss.NewStyle().Faint(true)
	borderStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff"))
	selectedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff66")).Bold(true)
	scrollStyle   = lipgloss.NewStyle().Faint(true)
)

// Model is the bubbletea model for the avatar designer.
type Model struct {
	fields       []Field
	focused      int
	scrollOffset int
	selections   [fieldCount]int
	confirmed    bool
	cancelled    bool
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
		if existing.FacialHair != nil {
			m.selections[fieldFacialHair] = clampIdx(*existing.FacialHair, len(m.fields[fieldFacialHair].Options))
		}
		if existing.MouthStyle != nil {
			m.selections[fieldMouthStyle] = clampIdx(*existing.MouthStyle, len(m.fields[fieldMouthStyle].Options))
		}
		if existing.FaceAccessory != nil {
			m.selections[fieldFaceAccessory] = clampIdx(*existing.FaceAccessory, len(m.fields[fieldFaceAccessory].Options))
		}
		if existing.HeadAccessory != nil {
			m.selections[fieldHeadAccessory] = clampIdx(*existing.HeadAccessory, len(m.fields[fieldHeadAccessory].Options))
		}
		if existing.ShirtDesign != nil {
			m.selections[fieldShirtDesign] = clampIdx(*existing.ShirtDesign, len(m.fields[fieldShirtDesign].Options))
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
			m.adjustScroll()
		case "down", "j":
			m.focused++
			if m.focused >= fieldCount {
				m.focused = 0
			}
			m.adjustScroll()
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

func (m *Model) adjustScroll() {
	if m.focused < m.scrollOffset {
		m.scrollOffset = m.focused
	}
	if m.focused >= m.scrollOffset+visibleFields {
		m.scrollOffset = m.focused - visibleFields + 1
	}
}

func (m Model) View() string {
	var sb strings.Builder

	boxW := 58

	// Title
	sb.WriteString("\n")
	sb.WriteString(borderStyle.Render("  ╔"+strings.Repeat("═", boxW)+"╗") + "\n")
	titleText := fmt.Sprintf("%*s", -(boxW-2), "            ✦ AVATAR DESIGNER ✦")
	sb.WriteString(borderStyle.Render("  ║") + " " + titleStyle.Render(titleText) + " " + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╠"+strings.Repeat("═", boxW)+"╣") + "\n")
	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", boxW) + borderStyle.Render("║") + "\n")

	// Render preview
	params := m.currentParams()
	grid := DrawCharacter(params)
	preview := RenderPreview(grid, 2)
	previewLines := strings.Split(strings.TrimRight(preview, "\n"), "\n")

	// Build visible option lines with scroll window
	end := m.scrollOffset + visibleFields
	if end > fieldCount {
		end = fieldCount
	}

	var optionLines []string

	// Scroll-up indicator
	if m.scrollOffset > 0 {
		optionLines = append(optionLines, scrollStyle.Render("      ▲ more"))
	} else {
		optionLines = append(optionLines, "")
	}

	for i := m.scrollOffset; i < end; i++ {
		label := m.fields[i].Label
		value := m.fields[i].Options[m.selections[i]]

		var line string
		if i == m.focused {
			labelStr := focusedStyle.Render(fmt.Sprintf("%-14s", label))
			line = fmt.Sprintf("%s %s %s %s",
				labelStr,
				arrowStyle.Render("◀"),
				selectedStyle.Render(fmt.Sprintf("%-13s", value)),
				arrowStyle.Render("▶"),
			)
		} else {
			labelStr := normalStyle.Render(fmt.Sprintf("%-14s", label))
			line = fmt.Sprintf("%s   %s  ",
				labelStr,
				valueStyle.Render(fmt.Sprintf("%-13s", value)),
			)
		}
		optionLines = append(optionLines, line)
	}

	// Scroll-down indicator
	if end < fieldCount {
		optionLines = append(optionLines, scrollStyle.Render("      ▼ more"))
	} else {
		optionLines = append(optionLines, "")
	}

	// Combine preview (left) with options (right)
	maxLines := len(optionLines)
	if len(previewLines) > maxLines {
		maxLines = len(previewLines)
	}
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
		sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-*s", boxW, row) + borderStyle.Render("║") + "\n")
	}

	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", boxW) + borderStyle.Render("║") + "\n")

	// Help line
	helpText := helpStyle.Render("    ↑↓ navigate   ◀▶ change   enter confirm   esc cancel")
	sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-*s", boxW, helpText) + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╚"+strings.Repeat("═", boxW)+"╝") + "\n")

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
	facialHair := m.selections[fieldFacialHair]
	mouthStyle := m.selections[fieldMouthStyle]
	faceAccessory := m.selections[fieldFaceAccessory]
	headAccessory := m.selections[fieldHeadAccessory]
	shirtDesign := m.selections[fieldShirtDesign]

	return Result{
		Avatar: config.AvatarConfig{
			SpriteIndex:   hairStyle, // keep spriteIndex in sync for backwards compat
			Color:         shirtColor,
			Hat:           nil,
			Trail:         nil,
			HairStyle:     &hairStyle,
			HairColor:     &hairColor,
			SkinTone:      &skinTone,
			ShirtColor:    &shirtColor,
			PantsColor:    &pantsColor,
			ShoeColor:     &shoeColor,
			FacialHair:    &facialHair,
			MouthStyle:    &mouthStyle,
			FaceAccessory: &faceAccessory,
			HeadAccessory: &headAccessory,
			ShirtDesign:   &shirtDesign,
		},
	}
}

func (m Model) currentParams() AvatarParams {
	return AvatarParams{
		HairStyle:     m.selections[fieldHairStyle],
		HairColor:     HairColors[m.selections[fieldHairColor]].Hex,
		SkinTone:      SkinTones[m.selections[fieldSkinTone]].Hex,
		ShirtColor:    ShirtColors[m.selections[fieldShirtColor]].Hex,
		PantsColor:    PantsColors[m.selections[fieldPantsColor]].Hex,
		ShoeColor:     ShoeColors[m.selections[fieldShoeColor]].Hex,
		FacialHair:    m.selections[fieldFacialHair],
		MouthStyle:    m.selections[fieldMouthStyle],
		FaceAccessory: m.selections[fieldFaceAccessory],
		HeadAccessory: m.selections[fieldHeadAccessory],
		ShirtDesign:   m.selections[fieldShirtDesign],
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
