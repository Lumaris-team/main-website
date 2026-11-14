// Icon paths mapping
const ICONS = {
  home: 'https://shared-assets.lumaris.fr.eu.org/icons/home.svg',
  grid: 'https://shared-assets.lumaris.fr.eu.org/icons/grid.svg',
  sparkles: 'https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg',
  'study-notes': 'https://shared-assets.lumaris.fr.eu.org/icons/study-notes.svg',
  web: 'https://shared-assets.lumaris.fr.eu.org/icons/web.svg',
  database: 'https://shared-assets.lumaris.fr.eu.org/icons/database.svg',
  wrench: 'https://shared-assets.lumaris.fr.eu.org/icons/wrench.svg',
  settings: 'https://shared-assets.lumaris.fr.eu.org/icons/settings.svg',
  refresh: 'https://shared-assets.lumaris.fr.eu.org/icons/refresh.svg',
  logout: 'https://shared-assets.lumaris.fr.eu.org/icons/logout.svg',
  more: 'https://shared-assets.lumaris.fr.eu.org/icons/more.svg',
  folder: 'https://shared-assets.lumaris.fr.eu.org/icons/folder.svg',
  customization: 'https://shared-assets.lumaris.fr.eu.org/icons/personalization.svg',
  file: 'https://shared-assets.lumaris.fr.eu.org/icons/file.svg',
  download: 'https://shared-assets.lumaris.fr.eu.org/icons/download.svg',
  homework: 'https://shared-assets.lumaris.fr.eu.org/icons/homework.svg',
  calendar: 'https://shared-assets.lumaris.fr.eu.org/icons/calendar.svg',
  clock: 'https://shared-assets.lumaris.fr.eu.org/icons/clock.svg',
  calculator: 'https://shared-assets.lumaris.fr.eu.org/icons/calculator.svg',
  converter: 'https://shared-assets.lumaris.fr.eu.org/icons/converter.svg',
  code: 'https://shared-assets.lumaris.fr.eu.org/icons/code.svg',
  statistics: 'https://shared-assets.lumaris.fr.eu.org/icons/statistics.svg',
  upload: 'https://shared-assets.lumaris.fr.eu.org/icons/upload.svg',
  'chat-settings': 'https://shared-assets.lumaris.fr.eu.org/icons/chat-settings.svg',
  chat: 'https://shared-assets.lumaris.fr.eu.org/icons/chat.svg',
  checkmark: 'https://shared-assets.lumaris.fr.eu.org/icons/checkmark.svg',
  'eye-open': 'https://shared-assets.lumaris.fr.eu.org/icons/eye-open.svg',
  'eye-closed': 'https://shared-assets.lumaris.fr.eu.org/icons/eye-closed.svg',
  subjects: 'https://shared-assets.lumaris.fr.eu.org/icons/subjects.svg',
  swap: 'https://shared-assets.lumaris.fr.eu.org/icons/swap.svg',
  play: 'https://shared-assets.lumaris.fr.eu.org/icons/play.svg',
  copy: 'https://shared-assets.lumaris.fr.eu.org/icons/copy.svg',
  'arrow-left': 'https://shared-assets.lumaris.fr.eu.org/icons/arrow-left.svg',
  'arrow-right': 'https://shared-assets.lumaris.fr.eu.org/icons/arrow-right.svg',
  send: 'https://shared-assets.lumaris.fr.eu.org/icons/send.svg',
  warning: 'https://shared-assets.lumaris.fr.eu.org/icons/warning.svg',
};

/**
 * Load icons via fetch and inject SVG content
 * @param {string|Element} selectorOrContainer - CSS selector or container element
 * @param {Object} customIcons - Optional custom icon mapping
 */
export async function loadIcons(selectorOrContainer = '[data-icon]', customIcons = null) {
  const iconMap = customIcons || ICONS;
  const container = typeof selectorOrContainer === 'string' 
    ? document 
    : selectorOrContainer;
  const selector = typeof selectorOrContainer === 'string' 
    ? selectorOrContainer 
    : '[data-icon]';
  
  const iconElements = container.querySelectorAll(selector);
  
  for (const element of iconElements) {
    const iconUrl = element.dataset.icon;
    if (!iconUrl) continue;
    
    try {
      const response = await fetch(iconUrl);
      const svgContent = await response.text();
      element.innerHTML = svgContent;
      
      // Set SVG size if needed
      const svg = element.querySelector('svg');
      if (svg) {
        const width = element.dataset.iconWidth;
        const height = element.dataset.iconHeight;
        if (width) svg.setAttribute('width', width);
        if (height) svg.setAttribute('height', height);
      }
    } catch (error) {
      console.error(`Failed to load icon ${iconUrl}:`, error);
    }
  }
}

/**
 * Get icon path by name
 * @param {string} name - Icon name
 * @returns {string} Icon path
 */
export function getIconPath(name) {
  return ICONS[name] || null;
}

export { ICONS };
