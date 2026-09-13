import { createAvatarEditor } from '../../client/prototypes/factory25dAvatarEditor';
const context = { ownerId: 'A'.repeat(43), username: 'Alice · local test' };
const editor = createAvatarEditor(() => context, () => {}, () => { document.body.dataset.saved = 'yes'; }, { open() {}, close() {}, setAvatar() {}, pose() {} });
void editor.open();
