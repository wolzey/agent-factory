package designer

// ColorOption is a named color with hex value.
type ColorOption struct {
	Name string
	Hex  string
}

// StyleOption is a named hair style with index.
type StyleOption struct {
	Name  string
	Index int
}

// Field represents one customizable avatar field.
type Field struct {
	Label   string
	Options []string // display names
	Colors  []string // parallel hex values (empty for style fields)
}

var HairStyles = []StyleOption{
	{"Short Flat", 0},
	{"Spiky", 1},
	{"Long Sides", 2},
	{"Cap", 3},
	{"Mohawk", 4},
	{"Bald", 5},
	{"Afro", 6},
	{"Bandana", 7},
}

var HairColors = []ColorOption{
	{"Dark Brown", "#332211"},
	{"Medium Brown", "#664422"},
	{"Black", "#222222"},
	{"Light Brown", "#aa6633"},
	{"Dark Red", "#880000"},
	{"Chestnut", "#553311"},
	{"Gray", "#444444"},
	{"Sandy Blonde", "#cc8844"},
	{"Platinum Blonde", "#e8d5b5"},
	{"Auburn", "#8b4513"},
	{"Bright Red", "#ff2200"},
	{"Silver", "#aaaaaa"},
	{"Blue Black", "#0a0a1a"},
	{"Dirty Blonde", "#b89a5a"},
}

var SkinTones = []ColorOption{
	{"Light", "#ffcc99"},
	{"Warm Light", "#f5c28a"},
	{"Medium Light", "#dba97a"},
	{"Medium", "#c68e5a"},
	{"Medium Dark", "#a16d42"},
	{"Dark", "#7a4e2d"},
}

var ShirtColors = []ColorOption{
	{"Blue", "#4a90d9"},
	{"Red", "#ff6b6b"},
	{"Green", "#51cf66"},
	{"Yellow", "#ffd43b"},
	{"Purple", "#cc5de8"},
	{"Orange", "#ff922b"},
	{"Teal", "#20c997"},
	{"Pink", "#f06595"},
	{"White", "#ffffff"},
	{"Black", "#333333"},
	{"Charcoal", "#555555"},
	{"Crimson", "#b22222"},
	{"Lime", "#a3e635"},
	{"Navy", "#1a1a5c"},
	{"Maroon", "#800040"},
	{"Coral", "#ff7f50"},
}

var PantsColors = []ColorOption{
	{"Navy", "#2a2a3e"},
	{"Dark Gray", "#3d3d3d"},
	{"Brown", "#4a3728"},
	{"Dark Green", "#1a3a1a"},
	{"Dark Purple", "#2a1a3e"},
	{"Black", "#1a1a1a"},
	{"Khaki", "#8b7d5b"},
	{"Olive", "#4a5a2a"},
	{"Charcoal", "#333333"},
}

var ShoeColors = []ColorOption{
	{"Black", "#222222"},
	{"Brown", "#3d2a1a"},
	{"Navy", "#2a2a3e"},
	{"White", "#ffffff"},
	{"Red", "#8b2222"},
	{"Gray", "#666666"},
	{"Tan", "#a0845a"},
}

var FacialHairStyles = []StyleOption{
	{"None", 0},
	{"Stubble", 1},
	{"Mustache", 2},
	{"Full Beard", 3},
	{"Goatee", 4},
	{"Soul Patch", 5},
}

var MouthStyles = []StyleOption{
	{"Default", 0},
	{"Smile", 1},
	{"Frown", 2},
	{"Open", 3},
	{"Teeth Grin", 4},
	{"Tongue Out", 5},
}

var FaceAccessories = []StyleOption{
	{"None", 0},
	{"Round Glasses", 1},
	{"Sunglasses", 2},
	{"Monocle", 3},
	{"Eye Patch", 4},
	{"Visor", 5},
}

var HeadAccessories = []StyleOption{
	{"None", 0},
	{"Crown", 1},
	{"Top Hat", 2},
	{"Halo", 3},
	{"Devil Horns", 4},
	{"Antenna", 5},
	{"Flower", 6},
}

var ShirtDesigns = []StyleOption{
	{"Solid", 0},
	{"H-Stripe", 1},
	{"V-Stripe", 2},
	{"Heart", 3},
	{"Star", 4},
	{"Number 1", 5},
	{"Skull", 6},
	{"Checkerboard", 7},
	{"Diamond", 8},
	{"Lightning", 9},
	{"Dots", 10},
	{"X-Cross", 11},
}

// AllFields returns the ordered list of customization fields.
func AllFields() []Field {
	return []Field{
		{
			Label:   "Hair Style",
			Options: styleNames(HairStyles),
		},
		{
			Label:   "Hair Color",
			Options: colorNames(HairColors),
			Colors:  colorHexes(HairColors),
		},
		{
			Label:   "Skin Tone",
			Options: colorNames(SkinTones),
			Colors:  colorHexes(SkinTones),
		},
		{
			Label:   "Facial Hair",
			Options: styleNames(FacialHairStyles),
		},
		{
			Label:   "Mouth",
			Options: styleNames(MouthStyles),
		},
		{
			Label:   "Face Acc.",
			Options: styleNames(FaceAccessories),
		},
		{
			Label:   "Head Acc.",
			Options: styleNames(HeadAccessories),
		},
		{
			Label:   "Shirt Color",
			Options: colorNames(ShirtColors),
			Colors:  colorHexes(ShirtColors),
		},
		{
			Label:   "Shirt Design",
			Options: styleNames(ShirtDesigns),
		},
		{
			Label:   "Pants Color",
			Options: colorNames(PantsColors),
			Colors:  colorHexes(PantsColors),
		},
		{
			Label:   "Shoe Color",
			Options: colorNames(ShoeColors),
			Colors:  colorHexes(ShoeColors),
		},
	}
}

func styleNames(opts []StyleOption) []string {
	names := make([]string, len(opts))
	for i, o := range opts {
		names[i] = o.Name
	}
	return names
}

func colorNames(opts []ColorOption) []string {
	names := make([]string, len(opts))
	for i, o := range opts {
		names[i] = o.Name
	}
	return names
}

func colorHexes(opts []ColorOption) []string {
	hexes := make([]string, len(opts))
	for i, o := range opts {
		hexes[i] = o.Hex
	}
	return hexes
}
