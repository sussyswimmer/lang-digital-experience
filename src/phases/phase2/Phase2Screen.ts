import { placeholderScreen } from '../placeholder';
import type { LayerId } from '../../app/types';

export default placeholderScreen('p2.title', (ctx, params) => ctx.completeLayer((params.layer ?? 'stitches') as LayerId));
