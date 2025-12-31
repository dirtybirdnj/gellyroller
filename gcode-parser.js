// G-code Parser
// Parses G-code files to extract metadata for job progress tracking

class GCodeParser {
  constructor() {
    // Patterns for detecting various G-code elements
    this.patterns = {
      // Movement commands
      rapidMove: /^G0\s/i,
      linearMove: /^G1\s/i,

      // Layer markers (various slicer formats)
      layerComment: /^;(?:LAYER|Layer)[:\s]*(\d+)/i,
      layerChange: /^;(?:LAYER_CHANGE|layer_change)/i,

      // Color/pen markers
      colorComment: /^;(?:COLOR|PEN)[:\s]*(.+)/i,

      // Tool changes
      toolSelect: /^T(\d+)/i,
      toolChange: /^M6\s*T?(\d+)?/i,

      // Pause commands (treat as layer boundaries)
      pause: /^M[01]\b/i,

      // Position extraction
      xCoord: /X([-\d.]+)/i,
      yCoord: /Y([-\d.]+)/i,
      zCoord: /Z([-\d.]+)/i,

      // Pen up/down (common in plotters)
      penUp: /^(?:G0.*Z|M3\s*S0|;.*pen\s*up)/i,
      penDown: /^(?:G1.*Z|M3\s*S|;.*pen\s*down)/i,

      // Comment extraction
      comment: /;(.*)$/
    };
  }

  parse(content, filename = 'unknown') {
    const lines = content.split('\n');
    const parsedLines = [];

    let stats = {
      totalLines: 0,
      movementCommands: 0,
      rapidMoves: 0,
      linearMoves: 0,
      estimatedTimeMs: 0
    };

    const layers = [];
    const toolChanges = [];
    const checkpoints = [];

    let currentLayer = null;
    let currentTool = 0;
    let currentPosition = { x: 0, y: 0, z: 0 };
    let lastZ = null;
    let penIsUp = true;
    let shapeCount = 0;
    let inShape = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const raw = lines[i];
      const line = raw.trim();

      // Skip empty lines
      if (!line) {
        parsedLines.push({ lineNum, raw, type: 'empty' });
        continue;
      }

      stats.totalLines++;

      const parsed = {
        lineNum,
        raw,
        type: 'unknown',
        command: null,
        params: {},
        comment: null
      };

      // Extract comment if present
      const commentMatch = line.match(this.patterns.comment);
      if (commentMatch) {
        parsed.comment = commentMatch[1].trim();
      }

      // Check for layer markers in comments
      const layerMatch = line.match(this.patterns.layerComment);
      if (layerMatch) {
        const layerIndex = parseInt(layerMatch[1], 10);
        if (currentLayer) {
          currentLayer.endLine = lineNum - 1;
          layers.push(currentLayer);
        }
        currentLayer = {
          index: layerIndex,
          startLine: lineNum,
          endLine: null,
          name: `Layer ${layerIndex}`,
          color: null,
          tool: currentTool
        };
        parsed.type = 'layer-marker';

        // Add checkpoint at layer start
        checkpoints.push({
          line: lineNum,
          position: { ...currentPosition },
          type: 'layer',
          layer: layerIndex
        });
      }

      // Check for color/pen comments
      const colorMatch = line.match(this.patterns.colorComment);
      if (colorMatch && currentLayer) {
        currentLayer.color = colorMatch[1].trim();
        parsed.type = 'color-marker';
      }

      // Check for tool changes
      const toolSelectMatch = line.match(this.patterns.toolSelect);
      const toolChangeMatch = line.match(this.patterns.toolChange);

      if (toolSelectMatch || toolChangeMatch) {
        const newTool = parseInt((toolSelectMatch || toolChangeMatch)[1] || '0', 10);
        if (newTool !== currentTool) {
          toolChanges.push({
            line: lineNum,
            tool: newTool,
            previousTool: currentTool
          });
          currentTool = newTool;
          parsed.type = 'tool-change';

          // Start new layer on tool change if no explicit layers
          if (!currentLayer || layers.length === 0) {
            if (currentLayer) {
              currentLayer.endLine = lineNum - 1;
              layers.push(currentLayer);
            }
            currentLayer = {
              index: layers.length,
              startLine: lineNum,
              endLine: null,
              name: `Tool ${newTool}`,
              color: null,
              tool: newTool
            };
          } else if (currentLayer) {
            currentLayer.tool = newTool;
          }

          // Add checkpoint at tool change
          checkpoints.push({
            line: lineNum,
            position: { ...currentPosition },
            type: 'tool-change',
            tool: newTool
          });
        }
      }

      // Check for pause commands (M0/M1)
      if (this.patterns.pause.test(line)) {
        parsed.type = 'pause';

        // Treat pause as layer boundary if no explicit layers
        if (layers.length === 0 && currentLayer) {
          currentLayer.endLine = lineNum - 1;
          layers.push(currentLayer);
          currentLayer = {
            index: layers.length,
            startLine: lineNum + 1,
            endLine: null,
            name: `Section ${layers.length + 1}`,
            color: null,
            tool: currentTool
          };
        }

        // Add checkpoint at pause
        checkpoints.push({
          line: lineNum,
          position: { ...currentPosition },
          type: 'pause'
        });
      }

      // Check for movement commands
      if (this.patterns.rapidMove.test(line)) {
        parsed.type = 'rapid-move';
        parsed.command = 'G0';
        stats.movementCommands++;
        stats.rapidMoves++;
        this._extractCoords(line, parsed, currentPosition);

        // Rapid moves often indicate pen up
        if (parsed.params.z !== undefined && parsed.params.z > currentPosition.z) {
          penIsUp = true;
          if (inShape) {
            shapeCount++;
            inShape = false;
          }
        }
      } else if (this.patterns.linearMove.test(line)) {
        parsed.type = 'linear-move';
        parsed.command = 'G1';
        stats.movementCommands++;
        stats.linearMoves++;
        this._extractCoords(line, parsed, currentPosition);

        // Linear moves with Z down indicate pen down
        if (parsed.params.z !== undefined && parsed.params.z < currentPosition.z) {
          penIsUp = false;
          if (!inShape) {
            inShape = true;
          }
        } else if (!penIsUp) {
          inShape = true;
        }
      }

      // Check for pen up/down
      if (this.patterns.penUp.test(line)) {
        penIsUp = true;
        if (inShape) {
          shapeCount++;
          inShape = false;
        }
      } else if (this.patterns.penDown.test(line)) {
        penIsUp = false;
        if (!inShape) {
          inShape = true;
        }
      }

      // Detect Z-based layer changes (if no explicit layer markers)
      if (parsed.params.z !== undefined && lastZ !== null && layers.length === 0) {
        const zDelta = parsed.params.z - lastZ;
        // Significant Z change might indicate layer change
        if (Math.abs(zDelta) > 0.5 && penIsUp) {
          checkpoints.push({
            line: lineNum,
            position: { ...currentPosition },
            type: 'z-change',
            zDelta
          });
        }
      }

      if (parsed.params.z !== undefined) {
        lastZ = parsed.params.z;
      }

      parsedLines.push(parsed);
    }

    // Close final layer
    if (currentLayer) {
      currentLayer.endLine = stats.totalLines;
      layers.push(currentLayer);
    }

    // If no layers detected, create a single layer for the whole file
    if (layers.length === 0) {
      layers.push({
        index: 0,
        startLine: 1,
        endLine: stats.totalLines,
        name: 'Main',
        color: null,
        tool: 0
      });
    }

    // Count final shape if we ended in one
    if (inShape) {
      shapeCount++;
    }

    // Estimate time (rough: 100ms per movement command)
    stats.estimatedTimeMs = stats.movementCommands * 100;
    stats.shapes = shapeCount;

    return {
      filename,
      lines: parsedLines,
      stats,
      layers,
      toolChanges,
      checkpoints,
      content  // Store original for execution
    };
  }

  _extractCoords(line, parsed, currentPosition) {
    const xMatch = line.match(this.patterns.xCoord);
    const yMatch = line.match(this.patterns.yCoord);
    const zMatch = line.match(this.patterns.zCoord);

    if (xMatch) {
      parsed.params.x = parseFloat(xMatch[1]);
      currentPosition.x = parsed.params.x;
    }
    if (yMatch) {
      parsed.params.y = parseFloat(yMatch[1]);
      currentPosition.y = parsed.params.y;
    }
    if (zMatch) {
      parsed.params.z = parseFloat(zMatch[1]);
      currentPosition.z = parsed.params.z;
    }
  }

  // Get summary stats without full parsing
  quickStats(content) {
    const lines = content.split('\n');
    let movementCommands = 0;
    let toolChanges = 0;
    let layers = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (this.patterns.rapidMove.test(trimmed) || this.patterns.linearMove.test(trimmed)) {
        movementCommands++;
      }
      if (this.patterns.toolSelect.test(trimmed) || this.patterns.toolChange.test(trimmed)) {
        toolChanges++;
      }
      if (this.patterns.layerComment.test(trimmed)) {
        layers++;
      }
    }

    return {
      totalLines: lines.length,
      movementCommands,
      toolChanges,
      layers: layers || 1
    };
  }
}

export default GCodeParser;
