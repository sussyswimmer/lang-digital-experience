import { placeholderScreen } from '../placeholder';

export default placeholderScreen('hub.title', (ctx) => ctx.go({ state: 'build', params: {} }));
