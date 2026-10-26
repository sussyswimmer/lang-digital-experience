import { placeholderScreen } from '../placeholder';
import type { ChapterId } from '../../app/types';

export default placeholderScreen('p3.title', (ctx, params) => ctx.completeChapter((params.chapter ?? 'protection') as ChapterId));
