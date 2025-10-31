// ASCII Art and Route Display Module
// Provides colorful startup banner and route listing

// ANSI Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// HTTP verb colors
const verbColors = {
  GET: colors.green,
  POST: colors.cyan,
  PUT: colors.yellow,
  DELETE: colors.red,
  PATCH: colors.magenta
};

export function displayBanner() {
  const banner = `
${colors.bright}${colors.magenta}
 ██████╗  ██████╗ ██████╗  ██████╗ ████████╗    ██████╗ ██████╗  █████╗ ██╗    ██╗███████╗    ██╗   ██╗ ██████╗ ██╗   ██╗██╗
 ██╔══██╗██╔═══██╗██╔══██╗██╔═══██╗╚══██╔══╝    ██╔══██╗██╔══██╗██╔══██╗██║    ██║██╔════╝    ╚██╗ ██╔╝██╔═══██╗██║   ██║██║
 ██████╔╝██║   ██║██████╔╝██║   ██║   ██║       ██║  ██║██████╔╝███████║██║ █╗ ██║███████╗     ╚████╔╝ ██║   ██║██║   ██║██║
 ██╔══██╗██║   ██║██╔══██╗██║   ██║   ██║       ██║  ██║██╔══██╗██╔══██║██║███╗██║╚════██║      ╚██╔╝  ██║   ██║██║   ██║╚═╝
 ██║  ██║╚██████╔╝██████╔╝╚██████╔╝   ██║       ██████╔╝██║  ██║██║  ██║╚███╔███╔╝███████║       ██║   ╚██████╔╝╚██████╔╝██╗
 ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝    ╚═╝       ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝       ╚═╝    ╚═════╝  ╚═════╝ ╚═╝
${colors.reset}
${colors.cyan}${colors.bright}                                  🔗 https://github.com/dirtybirdnj/gellyroller${colors.reset}

${colors.yellow}
                                     ___________________
                                    |  ___________  ___ \\
                                    | |           || = ||
                                    | |___________||___||
                                    |               ☁︎  |
                                    |  ╔═══════════════╗|
               ${colors.red}GELLYROLLER${colors.yellow}       |  ║ █████████████ ║|
                                    |  ║ █████████████ ║|
                                    |  ╚═══════════════╝|
                                   /|___________________|\\
                                  / /  ██           ██  \\ \\
                                 /_/___/══\\___()___/══\\___\\_\\
                                      /    \\       /    \\
                                     /______\\     /______\\

                                            ${colors.magenta}🌸  ← sakura${colors.reset}
${colors.dim}${colors.white}
    "A CNC drawing machine that makes gel pens roll across paper like a steamroller over delicate flowers"
${colors.reset}
`;

  console.log(banner);
}

export function displayRoutes(routes) {
  console.log(`${colors.bright}${colors.white}═══════════════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                              🎨 API ENDPOINTS 🎨${colors.reset}`);
  console.log(`${colors.bright}${colors.white}═══════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

  routes.forEach(route => {
    const color = verbColors[route.method] || colors.white;
    const methodPadded = route.method.padEnd(6);
    console.log(`  ${color}${colors.bright}${methodPadded}${colors.reset} ${colors.white}${route.path.padEnd(35)}${colors.reset} ${colors.dim}${route.description}${colors.reset}`);
  });

  console.log(`\n${colors.bright}${colors.white}═══════════════════════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Route definitions with descriptions
export const routes = [
  { method: 'GET', path: '/health', description: 'Health check endpoint' },
  { method: 'GET', path: '/position', description: 'Get current position' },
  { method: 'GET', path: '/state', description: 'Get full Duet state' },
  { method: 'GET', path: '/status', description: 'Get status summary' },
  { method: 'GET', path: '/config', description: 'Get machine configuration' },
  { method: 'PUT', path: '/config', description: 'Update machine configuration' },
  { method: 'GET', path: '/sd/files', description: 'List SD card files' },
  { method: 'GET', path: '/sd/info', description: 'SD card information' },
  { method: 'POST', path: '/sd/upload', description: 'Upload file to SD card' },
  { method: 'POST', path: '/execute', description: 'Execute G-code file' },
  { method: 'POST', path: '/pause', description: 'Pause operation' },
  { method: 'POST', path: '/cancel', description: 'Cancel operation' },
  { method: 'POST', path: '/emergency-stop', description: 'Emergency stop' },
  { method: 'POST', path: '/home', description: 'Home all axes' },
  { method: 'POST', path: '/goto/fast', description: 'Rapid move (G0)' },
  { method: 'POST', path: '/goto/slow', description: 'Controlled move (G1)' },
  { method: 'POST', path: '/gpio/send', description: 'Set GPIO pin' },
  { method: 'GET', path: '/gpio/read', description: 'Read GPIO pin' },
  { method: 'POST', path: '/gcode', description: 'Send raw G-code' },
  { method: 'POST', path: '/system/shutdown', description: 'Schedule system shutdown' },
  { method: 'POST', path: '/system/shutdown/cancel', description: 'Cancel scheduled shutdown' },
  { method: 'POST', path: '/system/restart', description: 'Restart Raspberry Pi' },
  { method: 'GET', path: '/system/uptime', description: 'Get system uptime' },
  { method: 'POST', path: '/webcam/photo', description: 'Capture photo' },
  { method: 'GET', path: '/webcam/config', description: 'Get webcam configuration' },
  { method: 'GET', path: '/webcam/images', description: 'List captured images' },
  { method: 'DELETE', path: '/webcam/images/:filename', description: 'Delete image' },
  { method: 'GET', path: '/webcam/test', description: 'Test webcam' }
];

export default { displayBanner, displayRoutes, routes };
