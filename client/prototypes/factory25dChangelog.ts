export type FactoryRelease = {
  id: string; date: string; title: string; summary: string;
  changes: readonly { label: string; text: string }[];
  prs: readonly number[]; commits?: readonly string[];
  /** Button that takes you to the patio to try the release; omitted when there is nothing to visit. */
  visit?: string;
};

/** Curated highlights. Dates refer to merges, or the source commit for the original factory. */
export const factoryChangelog: readonly FactoryRelease[] = [
  { id: '2026-09-23-lighter', date: '2026-09-23', title: 'Same factory. Less fan noise.',
    summary: 'Faster to load, easier on your laptop, and smoother when the room is busy.',
    changes: [
      { label: 'Easy on your laptop.', text: 'The room draws fewer frames while you’re just watching, and the lamps stop redrawing their shadows every frame. Leave it open all day.' },
      { label: 'Faster first load.', text: 'The garage cars now download about 15 times smaller, and your browser keeps the rest between visits.' },
      { label: 'Smoother when it’s busy.', text: 'Walking agents take a fraction of the server’s effort, and each viewer receives less data.' },
    ], prs: [68, 69] },
  { id: '2026-09-11-games', date: '2026-09-11', title: 'A little friendly competition',
    summary: 'Challenge a teammate to HORSE, or head outside for Duck Hunt.', visit: 'find Duck Hunt on the patio ↗',
    changes: [
      { label: 'Your shot.', text: 'Play asynchronous HORSE, even when your opponent is offline.' },
      { label: 'Out on the patio.', text: 'Five waves of Duck Hunt, three shots per wave, and tougher rounds as you go.' },
      { label: 'Keep moving.', text: 'Switch destinations mid-trip with clearer controls and quieter character throws.' },
    ], prs: [46, 47, 48] },
  { id: '2026-09-10-personal-space', date: '2026-09-10', title: 'Give your people some space',
    summary: 'More expressive characters. A little more elbow room.',
    changes: [
      { label: 'Room to breathe.', text: 'Agents give one another more space in crowded parts of the factory.' },
      { label: 'Pick them up.', text: 'Grab and throw characters, complete with airborne poses and a landing animation.' },
      { label: 'Take the controls.', text: 'Find your agent from your profile, then move around the factory.' },
    ], prs: [45] },
  { id: '2026-09-08-island', date: '2026-09-08', title: 'One island. Your whole factory.',
    summary: 'Rooms, your agents, and sound come together.',
    changes: [
      { label: 'One place for everything.', text: 'The bottom island brings navigation, your avatar, sound, and game controls together.' },
      { label: 'Meet the DJ.', text: 'Search for a song and add it to the shared lounge queue.' },
      { label: 'Easier to get around.', text: 'Better keyboard access, clearer control labels, and project names for each agent session.' },
    ], prs: [41, 42, 44] },
  { id: '2026-09-07-room-life', date: '2026-09-07', title: 'The factory comes to life',
    summary: 'Room staff, shared driving, and credit for your work.',
    changes: [
      { label: 'Take a drive.', text: 'Hop into a garage car. Everyone in the room can see you moving.' },
      { label: 'Make it count.', text: 'Active work earns tickets; GitHub contributions give your profile a level.' },
      { label: 'Settle in.', text: 'Changing daylight, rain, and room staff make the factory feel occupied.' },
    ], prs: [33, 34, 35, 36, 37] },
  { id: '2026-09-06-garage', date: '2026-09-06', title: 'Going down: the garage',
    summary: 'A whole new floor to explore.',
    changes: [
      { label: 'Going down.', text: 'Take the elevator from the main room into the new garage.' },
      { label: 'Stay a while.', text: 'Discover downstairs workstations, cars, and new room details.' },
    ], prs: [32] },
  { id: '2026-09-05-factory', date: '2026-09-05', title: 'Make yourself at home',
    summary: 'Your avatar, your people, and a little fresh air.',
    changes: [
      { label: 'Look like you.', text: 'Edit your avatar in the factory and save it to your profile.' },
      { label: 'See who’s here.', text: 'The front desk shows the people connected to the shared room.' },
      { label: 'Take a break.', text: 'Shoot some hoops, or explore the patio’s garden terraces and stairs.' },
    ], prs: [26, 27, 28, 29, 30, 31] },
  { id: '2026-03-25-original', date: '2026-03-25', title: 'Where it started',
    summary: 'A neon arcade, a front counter, and a place for your agents.',
    changes: [
      { label: 'The original factory.', text: 'Pixel arcade cabinets turned agent sessions into a room you could watch.' },
      { label: 'Already feeling at home.', text: 'A front counter and purple lounge sat beside the arcade floor.' },
    ], prs: [], commits: ['71d910f', '501df9f'] },
];
