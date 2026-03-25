package ui

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

var (
	TitleStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ff00ff"))
	SuccessStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#51cf66"))
	WarnStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffd43b"))
	ErrorStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff6b6b"))
	DimStyle     = lipgloss.NewStyle().Faint(true)
	CyanStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ffff"))
	BoldStyle    = lipgloss.NewStyle().Bold(true)
)

func PrintBanner() {
	fmt.Println()
	fmt.Println(TitleStyle.Render("    ╔═══════════════════════════════════════╗"))
	fmt.Println(TitleStyle.Render("    ║         🕹️  AGENT FACTORY  🕹️          ║"))
	fmt.Println(TitleStyle.Render("    ║   2D pixel art agent visualization    ║"))
	fmt.Println(TitleStyle.Render("    ╚═══════════════════════════════════════╝"))
	fmt.Println()
	fmt.Println(DimStyle.Render("  See your team's Claude agents working in a retro arcade"))
	fmt.Println()
}

func Info(msg string) {
	fmt.Printf("  %s %s\n", CyanStyle.Render(">"), msg)
}

func Success(msg string) {
	fmt.Printf("  %s %s\n", SuccessStyle.Render("✓"), msg)
}

func Warn(msg string) {
	fmt.Printf("  %s %s\n", WarnStyle.Render("!"), msg)
}

func Error(msg string) {
	fmt.Printf("  %s %s\n", ErrorStyle.Render("✗"), msg)
}
