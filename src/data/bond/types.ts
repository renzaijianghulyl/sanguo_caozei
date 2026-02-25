/**
 * 名望与恶名类型，供恶行反馈与叙事风格使用。
 * fame（名望）为正值，infamy（恶名）为负向声誉，二者可并存（如既有名望又有恶名）。
 */

/** 单次恶行（纵火、劫掠、行刺等）导致的恶名增加值 */
export const INFAMY_DELTA_EVIL_DEED = 10;

/** 名望/恶名显示与叙事用的阈值：高于此值视为「高恶名」 */
export const INFAMY_HIGH_THRESHOLD = 30;
