import { createDeviceLinks } from '../../client/prototypes/factory25dDeviceLinks';
const session = await fetch('/api/auth/session', { credentials: 'same-origin' }).then(r => r.json());
const view = createDeviceLinks(() => session.authenticated ? session : undefined);
view.open();
