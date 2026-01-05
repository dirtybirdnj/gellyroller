// SVG to G-code Processor
// Uses vpype for SVG optimization, then generates G-code directly

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Default processing options
const DEFAULT_OPTIONS = {
  // Canvas size in mm
  canvasWidth: 480,
  canvasHeight: 480,

  // Margins in mm
  margin: 10,

  // Feed rates in mm/min
  travelSpeed: 6000,   // G0 rapid moves
  drawSpeed: 3000,     // G1 drawing moves

  // Pen servo timing (milliseconds)
  penDownDelay: 150,   // Wait after pen down before drawing
  penUpDelay: 100,     // Wait after pen up before traveling

  // Optimization flags
  optimize: true,       // Run linesort/linemerge
  simplify: false,      // Run linesimplify (reduces points)
  simplifyTolerance: 0.1, // mm tolerance for simplification

  // Scaling mode: 'fit' (scale to fill), 'contain' (scale down only), 'none' (original size in mm)
  scaleMode: 'contain',

  // Alignment within canvas (0,0 is front-left where homing sensors are)
  alignX: 'center',    // 'left', 'center', 'right'
  alignY: 'center',    // 'front', 'center', 'back'

  // Legacy option (deprecated, use alignX/alignY)
  center: true
};

// Machine-specific G-code settings
const GCODE_CONFIG = {
  penUp: 'M42 P0 S0',
  penDown: 'M42 P0 S1',
  header: ['G21', 'G90', 'M42 P0 S0'],
  footer: ['M42 P0 S0', 'G0 X0 Y0']
};

class SvgProcessor {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.vpypeAvailable = null;
    this.vpypeVersion = null;
    this.vpypePath = null;
  }

  /**
   * Check if vpype is installed and available
   */
  async checkVpype() {
    if (this.vpypeAvailable !== null) {
      return this.vpypeAvailable;
    }

    // Check common vpype locations
    const possiblePaths = [
      'vpype',
      `${os.homedir()}/.vpype-venv/bin/vpype`,
      '/usr/local/bin/vpype',
      '/usr/bin/vpype'
    ];

    for (const vpypePath of possiblePaths) {
      try {
        const result = await this.runCommand(vpypePath, ['--version']);
        this.vpypeVersion = result.stdout.trim();
        this.vpypeAvailable = true;
        this.vpypePath = vpypePath;
        return true;
      } catch (err) {
        // Try next path
      }
    }

    this.vpypeAvailable = false;
    return false;
  }

  /**
   * Get vpype status info
   */
  async getStatus() {
    const available = await this.checkVpype();
    return {
      available,
      version: this.vpypeVersion,
      vpypePath: this.vpypePath,
      canvas: {
        width: this.options.canvasWidth,
        height: this.options.canvasHeight
      }
    };
  }

  /**
   * Process an SVG file and convert to G-code
   */
  async processToGcode(svgContent, options = {}) {
    const opts = { ...this.options, ...options };

    // Check vpype availability
    const vpypeAvailable = await this.checkVpype();

    // Create temp files
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `gellyroller-input-${timestamp}.svg`);
    const outputPath = path.join(tempDir, `gellyroller-output-${timestamp}.svg`);

    try {
      // Write SVG to temp file
      await fs.writeFile(inputPath, svgContent, 'utf-8');

      let processedSvg;

      if (vpypeAvailable) {
        // Use vpype for optimization
        const args = this.buildVpypeArgs(inputPath, outputPath, opts);
        console.log('vpype args:', args.join(' '));
        await this.runCommand(this.vpypePath, args);
        processedSvg = await fs.readFile(outputPath, 'utf-8');
      } else {
        // No vpype - use original SVG
        processedSvg = svgContent;
      }

      // Parse SVG and generate G-code
      const paths = this.parseSvgPaths(processedSvg);

      // Debug: log bounds before scaling
      if (paths.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pathObj of paths) {
          for (const pt of pathObj.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
        }
        console.log(`SVG bounds before scaling: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} (${(maxX-minX).toFixed(1)} x ${(maxY-minY).toFixed(1)})`);
        console.log(`Scale mode: ${opts.scaleMode}, Align: ${opts.alignX}/${opts.alignY}`);
      }

      const scaledPaths = this.scalePaths(paths, opts);

      // Debug: log bounds after scaling
      if (scaledPaths.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pathObj of scaledPaths) {
          for (const pt of pathObj.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
        }
        console.log(`SVG bounds after scaling: ${minX.toFixed(1)},${minY.toFixed(1)} to ${maxX.toFixed(1)},${maxY.toFixed(1)} (${(maxX-minX).toFixed(1)} x ${(maxY-minY).toFixed(1)})`);
      }

      const gcode = this.generateGcode(scaledPaths, opts);

      // Calculate stats
      const stats = this.calculateStats(gcode);

      return {
        success: true,
        gcode,
        stats,
        optimized: vpypeAvailable,
        pathCount: scaledPaths.length
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        gcode: null,
        stats: null
      };
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Build vpype command arguments for optimization
   */
  buildVpypeArgs(inputPath, outputPath, opts) {
    const args = ['-v'];

    // Read SVG
    args.push('read', inputPath);

    // Optimization passes
    if (opts.optimize) {
      args.push('linemerge', '--tolerance', '0.5mm');
      args.push('linesort');
    }

    // Simplification
    if (opts.simplify) {
      args.push('linesimplify', '--tolerance', `${opts.simplifyTolerance}mm`);
    }

    // Only use vpype layout for 'fit' mode - otherwise let our scalePaths handle it
    // vpype layout always scales to fill, which is 'fit' behavior
    if (opts.scaleMode === 'fit') {
      const effectiveWidth = opts.canvasWidth - (opts.margin * 2);
      const effectiveHeight = opts.canvasHeight - (opts.margin * 2);
      args.push('layout', '-m', '0', `${effectiveWidth}x${effectiveHeight}mm`);
    }

    // Output optimized SVG
    args.push('write', outputPath);

    return args;
  }

  /**
   * Parse SVG paths from SVG content
   * Extracts polylines and paths, converting to point arrays
   */
  parseSvgPaths(svgContent) {
    const paths = [];

    // Extract viewBox for coordinate system
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
    let viewBox = { minX: 0, minY: 0, width: 100, height: 100 };
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
      viewBox = { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }

    // Also check width/height attributes
    const widthMatch = svgContent.match(/\bwidth=["']([0-9.]+)/);
    const heightMatch = svgContent.match(/\bheight=["']([0-9.]+)/);
    if (widthMatch && !viewBoxMatch) viewBox.width = parseFloat(widthMatch[1]);
    if (heightMatch && !viewBoxMatch) viewBox.height = parseFloat(heightMatch[1]);

    // Extract path elements
    const pathRegex = /<path[^>]*\bd=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = pathRegex.exec(svgContent)) !== null) {
      const d = match[1];
      const points = this.parsePathD(d);
      if (points.length > 0) {
        paths.push({ points, viewBox });
      }
    }

    // Extract polyline elements
    const polylineRegex = /<polyline[^>]*\bpoints=["']([^"']+)["'][^>]*>/gi;
    while ((match = polylineRegex.exec(svgContent)) !== null) {
      const pointsStr = match[1];
      const points = this.parsePolylinePoints(pointsStr);
      if (points.length > 0) {
        paths.push({ points, viewBox });
      }
    }

    // Extract polygon elements
    const polygonRegex = /<polygon[^>]*\bpoints=["']([^"']+)["'][^>]*>/gi;
    while ((match = polygonRegex.exec(svgContent)) !== null) {
      const pointsStr = match[1];
      const points = this.parsePolylinePoints(pointsStr);
      if (points.length > 1) {
        // Close the polygon
        points.push({ ...points[0] });
        paths.push({ points, viewBox });
      }
    }

    // Extract line elements
    const lineRegex = /<line[^>]*\bx1=["']([^"']+)["'][^>]*\by1=["']([^"']+)["'][^>]*\bx2=["']([^"']+)["'][^>]*\by2=["']([^"']+)["'][^>]*>/gi;
    while ((match = lineRegex.exec(svgContent)) !== null) {
      paths.push({
        points: [
          { x: parseFloat(match[1]), y: parseFloat(match[2]) },
          { x: parseFloat(match[3]), y: parseFloat(match[4]) }
        ],
        viewBox
      });
    }

    // Extract circle elements (approximate with segments)
    const circleRegex = /<circle[^>]*\bcx=["']([^"']+)["'][^>]*\bcy=["']([^"']+)["'][^>]*\br=["']([^"']+)["'][^>]*>/gi;
    while ((match = circleRegex.exec(svgContent)) !== null) {
      const cx = parseFloat(match[1]);
      const cy = parseFloat(match[2]);
      const r = parseFloat(match[3]);
      const points = this.circleToPoints(cx, cy, r, 36);
      paths.push({ points, viewBox });
    }

    // Extract rect elements
    const rectRegex = /<rect[^>]*\bx=["']([^"']+)["'][^>]*\by=["']([^"']+)["'][^>]*\bwidth=["']([^"']+)["'][^>]*\bheight=["']([^"']+)["'][^>]*>/gi;
    while ((match = rectRegex.exec(svgContent)) !== null) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const w = parseFloat(match[3]);
      const h = parseFloat(match[4]);
      paths.push({
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y }  // Close
        ],
        viewBox
      });
    }

    return paths;
  }

  /**
   * Parse SVG path d attribute
   */
  parsePathD(d) {
    const points = [];
    let x = 0, y = 0;
    let startX = 0, startY = 0;

    // Tokenize the path
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+/g) || [];

    let i = 0;
    let currentCommand = 'M';

    while (i < tokens.length) {
      const token = tokens[i];

      if (/[MmLlHhVvCcSsQqTtAaZz]/.test(token)) {
        currentCommand = token;
        i++;
      }

      switch (currentCommand) {
        case 'M':  // Move to (absolute)
          x = parseFloat(tokens[i++]);
          y = parseFloat(tokens[i++]);
          startX = x;
          startY = y;
          if (points.length > 0) {
            // New subpath - we'd need to handle this as separate path
          }
          points.push({ x, y });
          currentCommand = 'L';  // Subsequent coords are lines
          break;

        case 'm':  // Move to (relative)
          x += parseFloat(tokens[i++]);
          y += parseFloat(tokens[i++]);
          startX = x;
          startY = y;
          points.push({ x, y });
          currentCommand = 'l';
          break;

        case 'L':  // Line to (absolute)
          x = parseFloat(tokens[i++]);
          y = parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'l':  // Line to (relative)
          x += parseFloat(tokens[i++]);
          y += parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'H':  // Horizontal line (absolute)
          x = parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'h':  // Horizontal line (relative)
          x += parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'V':  // Vertical line (absolute)
          y = parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'v':  // Vertical line (relative)
          y += parseFloat(tokens[i++]);
          points.push({ x, y });
          break;

        case 'C':  // Cubic bezier (absolute) - approximate with lines
          {
            const x1 = parseFloat(tokens[i++]);
            const y1 = parseFloat(tokens[i++]);
            const x2 = parseFloat(tokens[i++]);
            const y2 = parseFloat(tokens[i++]);
            const endX = parseFloat(tokens[i++]);
            const endY = parseFloat(tokens[i++]);
            const bezierPoints = this.cubicBezierToPoints(x, y, x1, y1, x2, y2, endX, endY, 10);
            points.push(...bezierPoints.slice(1));  // Skip first point (current position)
            x = endX;
            y = endY;
          }
          break;

        case 'c':  // Cubic bezier (relative)
          {
            const x1 = x + parseFloat(tokens[i++]);
            const y1 = y + parseFloat(tokens[i++]);
            const x2 = x + parseFloat(tokens[i++]);
            const y2 = y + parseFloat(tokens[i++]);
            const endX = x + parseFloat(tokens[i++]);
            const endY = y + parseFloat(tokens[i++]);
            const bezierPoints = this.cubicBezierToPoints(x, y, x1, y1, x2, y2, endX, endY, 10);
            points.push(...bezierPoints.slice(1));
            x = endX;
            y = endY;
          }
          break;

        case 'Q':  // Quadratic bezier (absolute)
          {
            const cx = parseFloat(tokens[i++]);
            const cy = parseFloat(tokens[i++]);
            const endX = parseFloat(tokens[i++]);
            const endY = parseFloat(tokens[i++]);
            const bezierPoints = this.quadBezierToPoints(x, y, cx, cy, endX, endY, 10);
            points.push(...bezierPoints.slice(1));
            x = endX;
            y = endY;
          }
          break;

        case 'q':  // Quadratic bezier (relative)
          {
            const cx = x + parseFloat(tokens[i++]);
            const cy = y + parseFloat(tokens[i++]);
            const endX = x + parseFloat(tokens[i++]);
            const endY = y + parseFloat(tokens[i++]);
            const bezierPoints = this.quadBezierToPoints(x, y, cx, cy, endX, endY, 10);
            points.push(...bezierPoints.slice(1));
            x = endX;
            y = endY;
          }
          break;

        case 'Z':
        case 'z':  // Close path
          if (points.length > 0 && (x !== startX || y !== startY)) {
            points.push({ x: startX, y: startY });
          }
          x = startX;
          y = startY;
          i++;
          break;

        default:
          // Skip unknown commands
          i++;
      }
    }

    return points;
  }

  /**
   * Parse polyline/polygon points attribute
   */
  parsePolylinePoints(pointsStr) {
    const numbers = pointsStr.trim().split(/[\s,]+/).map(Number);
    const points = [];
    for (let i = 0; i < numbers.length - 1; i += 2) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
    return points;
  }

  /**
   * Convert cubic bezier to line segments
   */
  cubicBezierToPoints(x0, y0, x1, y1, x2, y2, x3, y3, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Convert quadratic bezier to line segments
   */
  quadBezierToPoints(x0, y0, x1, y1, x2, y2, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
      const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
      points.push({ x, y });
    }
    return points;
  }

  /**
   * Convert circle to points
   */
  circleToPoints(cx, cy, r, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      });
    }
    return points;
  }

  /**
   * Scale and translate paths to fit canvas
   * Supports different scale modes and alignment options
   */
  scalePaths(paths, opts) {
    if (paths.length === 0) return [];

    // Find bounds of all paths
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const pathObj of paths) {
      for (const pt of pathObj.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }

    const svgWidth = maxX - minX;
    const svgHeight = maxY - minY;

    if (svgWidth === 0 || svgHeight === 0) return paths;

    // Calculate available area (canvas minus margins)
    const availWidth = opts.canvasWidth - (opts.margin * 2);
    const availHeight = opts.canvasHeight - (opts.margin * 2);

    // Determine scale based on scaleMode
    let scale = 1;
    const scaleMode = opts.scaleMode || 'contain';

    if (scaleMode === 'fit') {
      // Scale to fill available area (up or down)
      const scaleX = availWidth / svgWidth;
      const scaleY = availHeight / svgHeight;
      scale = Math.min(scaleX, scaleY);
    } else if (scaleMode === 'contain') {
      // Scale down only if needed, never scale up
      const scaleX = availWidth / svgWidth;
      const scaleY = availHeight / svgHeight;
      scale = Math.min(scaleX, scaleY, 1); // Cap at 1 (original size)
    } else if (scaleMode === 'none') {
      // No scaling - assume SVG units are already in mm
      scale = 1;
    }

    // Calculate scaled dimensions
    const scaledWidth = svgWidth * scale;
    const scaledHeight = svgHeight * scale;

    // Calculate X offset based on alignment
    let offsetX = opts.margin;
    const alignX = opts.alignX || 'center';
    if (alignX === 'center') {
      offsetX = opts.margin + (availWidth - scaledWidth) / 2;
    } else if (alignX === 'right') {
      offsetX = opts.margin + (availWidth - scaledWidth);
    }
    // 'left' uses default: opts.margin

    // Calculate Y offset based on alignment
    // Note: Y=0 is front (home), Y=max is back
    let offsetY = opts.margin;
    const alignY = opts.alignY || 'center';
    if (alignY === 'center') {
      offsetY = opts.margin + (availHeight - scaledHeight) / 2;
    } else if (alignY === 'back') {
      offsetY = opts.margin + (availHeight - scaledHeight);
    }
    // 'front' uses default: opts.margin

    // Transform all paths
    return paths.map(pathObj => ({
      points: pathObj.points.map(pt => ({
        x: (pt.x - minX) * scale + offsetX,
        y: (pt.y - minY) * scale + offsetY
      }))
    }));
  }

  /**
   * Generate G-code from paths
   */
  generateGcode(paths, opts) {
    const lines = [];
    const penDownDelay = opts.penDownDelay || 150;
    const penUpDelay = opts.penUpDelay || 100;

    // Header
    lines.push('; Generated by Gellyroller SVG Processor');
    lines.push(`; Canvas: ${opts.canvasWidth}x${opts.canvasHeight}mm`);
    lines.push(`; Paths: ${paths.length}`);
    lines.push(`; Pen delays: down=${penDownDelay}ms, up=${penUpDelay}ms`);
    lines.push('');
    lines.push(...GCODE_CONFIG.header);
    if (penUpDelay > 0) lines.push(`G4 P${penUpDelay}`);
    lines.push('');

    for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
      const path = paths[pathIdx];
      if (path.points.length < 2) continue;

      lines.push(`; Path ${pathIdx + 1}`);

      // Move to start (pen up)
      const start = path.points[0];
      lines.push(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${opts.travelSpeed}`);

      // Pen down + dwell
      lines.push(GCODE_CONFIG.penDown);
      if (penDownDelay > 0) lines.push(`G4 P${penDownDelay}`);

      // Draw path
      for (let i = 1; i < path.points.length; i++) {
        const pt = path.points[i];
        lines.push(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${opts.drawSpeed}`);
      }

      // Pen up + dwell
      lines.push(GCODE_CONFIG.penUp);
      if (penUpDelay > 0) lines.push(`G4 P${penUpDelay}`);
      lines.push('');
    }

    // Footer
    lines.push('; End');
    lines.push(...GCODE_CONFIG.footer);

    return lines.join('\n');
  }

  /**
   * Calculate statistics from G-code including time estimation
   */
  calculateStats(gcode, opts = {}) {
    const lines = gcode.split('\n');
    let rapidMoves = 0;
    let drawMoves = 0;
    let penUps = 0;
    let penDowns = 0;
    let totalDistance = 0;
    let drawDistance = 0;
    let travelDistance = 0;
    let lastX = 0, lastY = 0;
    let penIsDown = false;
    let currentFeedRate = opts.travelSpeed || 6000; // mm/min default
    let totalTimeMs = 0;
    let dwellTimeMs = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse feed rate if present
      const feedMatch = trimmed.match(/F([\d.]+)/);
      if (feedMatch) {
        currentFeedRate = parseFloat(feedMatch[1]);
      }

      // Parse dwell time
      if (trimmed.startsWith('G4')) {
        const pMatch = trimmed.match(/P([\d.]+)/);
        if (pMatch) {
          const dwell = parseFloat(pMatch[1]);
          dwellTimeMs += dwell;
          totalTimeMs += dwell;
        }
      }
      else if (trimmed.startsWith('G0')) {
        rapidMoves++;
        const coords = this.parseCoordinates(trimmed);
        if (coords) {
          const dist = Math.sqrt(Math.pow(coords.x - lastX, 2) + Math.pow(coords.y - lastY, 2));
          totalDistance += dist;
          travelDistance += dist;
          // Time = distance / speed, convert mm/min to mm/ms
          const moveTimeMs = (dist / currentFeedRate) * 60 * 1000;
          totalTimeMs += moveTimeMs;
          lastX = coords.x;
          lastY = coords.y;
        }
      }
      else if (trimmed.startsWith('G1')) {
        drawMoves++;
        const coords = this.parseCoordinates(trimmed);
        if (coords) {
          const dist = Math.sqrt(Math.pow(coords.x - lastX, 2) + Math.pow(coords.y - lastY, 2));
          totalDistance += dist;
          if (penIsDown) {
            drawDistance += dist;
          }
          const moveTimeMs = (dist / currentFeedRate) * 60 * 1000;
          totalTimeMs += moveTimeMs;
          lastX = coords.x;
          lastY = coords.y;
        }
      }
      else if (trimmed.includes('M42 P0 S0')) {
        penUps++;
        penIsDown = false;
      }
      else if (trimmed.includes('M42 P0 S1')) {
        penDowns++;
        penIsDown = true;
      }
    }

    return {
      totalLines: lines.length,
      rapidMoves,
      drawMoves,
      penUps,
      penDowns,
      shapes: penDowns,
      totalDistanceMm: Math.round(totalDistance),
      drawDistanceMm: Math.round(drawDistance),
      travelDistanceMm: Math.round(travelDistance),
      estimatedTimeMs: Math.round(totalTimeMs),
      dwellTimeMs: Math.round(dwellTimeMs)
    };
  }

  /**
   * Parse X/Y coordinates from a G-code line
   */
  parseCoordinates(line) {
    const xMatch = line.match(/X([-\d.]+)/);
    const yMatch = line.match(/Y([-\d.]+)/);

    if (xMatch || yMatch) {
      return {
        x: xMatch ? parseFloat(xMatch[1]) : 0,
        y: yMatch ? parseFloat(yMatch[1]) : 0
      };
    }
    return null;
  }

  /**
   * Run a command and return stdout/stderr
   */
  runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

// Export singleton instance and class
const processor = new SvgProcessor();

export { SvgProcessor, GCODE_CONFIG, DEFAULT_OPTIONS };
export default processor;
