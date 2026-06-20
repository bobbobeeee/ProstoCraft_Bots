;(function initBotStudioCoordinateUtils() {
  function formatCoordinateValue(value) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? String(numberValue) : '0'
  }

  function formatCoordinatesText(coordinates = []) {
    return coordinates
      .map(coordinate =>
        ['x', 'y', 'z'].map(axis => formatCoordinateValue(coordinate?.[axis])).join(' ')
      )
      .join('\n')
  }

  function expandCoordinateRange(start, end) {
    if (start === end) return [start]

    const step = start < end ? 1 : -1
    const values = []
    for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
      values.push(value)
    }
    return values
  }

  function parseCoordinateToken(token) {
    const normalized = token.trim().replace(',', '.')
    const rangeMatch = normalized.match(/^(-?\d+(?:\.\d+)?)(?:\.\.|-)(-?\d+(?:\.\d+)?)$/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      if (Number.isInteger(start) && Number.isInteger(end)) {
        return expandCoordinateRange(start, end)
      }
    }

    const value = Number(normalized)
    if (!Number.isFinite(value)) {
      return null
    }
    return [value]
  }

  function expandCoordinateSegment(numbers) {
    const start = numbers.slice(0, 3)
    const end = numbers.slice(3, 6)
    const deltas = end.map((value, index) => value - start[index])
    const distance = Math.max(...deltas.map(delta => Math.abs(delta)))

    if (!Number.isInteger(distance) || distance === 0) {
      return [
        { x: start[0], y: start[1], z: start[2] },
        { x: end[0], y: end[1], z: end[2] }
      ]
    }

    if (!deltas.every(delta => delta === 0 || Math.abs(delta) === distance)) {
      return [
        { x: start[0], y: start[1], z: start[2] },
        { x: end[0], y: end[1], z: end[2] }
      ]
    }

    return Array.from({ length: distance + 1 }, (_, index) => ({
      x: start[0] + Math.sign(deltas[0]) * index,
      y: start[1] + Math.sign(deltas[1]) * index,
      z: start[2] + Math.sign(deltas[2]) * index
    }))
  }

  function uniqueCoordinates(coordinates) {
    const seen = new Set()
    const result = []

    for (const coordinate of coordinates) {
      const key = `${coordinate.x}:${coordinate.y}:${coordinate.z}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(coordinate)
    }

    return result
  }

  function parseCoordinatesText(text) {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.replace(/(?:#|\/\/).*$/, ''))
      .map(line => line.trim())
      .filter(Boolean)

    if (!lines.length) {
      throw new Error('Вставьте хотя бы одну строку с координатами.')
    }

    const parsedCoordinates = []

    lines.forEach((line, index) => {
      const tokenLine = line
        .replace(/[xyzXYZ]\s*[:=]\s*/g, '')
        .replace(/[;,|]/g, ' ')
        .replace(/[()[\]{}]/g, ' ')
        .trim()
      const tokens = tokenLine.split(/\s+/).filter(Boolean)

      if (tokens.length === 3) {
        const ranges = tokens.map(parseCoordinateToken)
        if (ranges.every(Boolean)) {
          for (const x of ranges[0]) {
            for (const y of ranges[1]) {
              for (const z of ranges[2]) {
                parsedCoordinates.push({ x, y, z })
              }
            }
          }
          return
        }
      }

      const numbers =
        line.match(/-?\d+(?:[.,]\d+)?/g)?.map(value => Number(value.replace(',', '.'))) || []
      if (numbers.length === 6 && /(?:->|=>|\bto\b|\bдо\b)/i.test(line)) {
        parsedCoordinates.push(...expandCoordinateSegment(numbers))
        return
      }

      if (numbers.length >= 3 && numbers.length % 3 === 0) {
        for (let numberIndex = 0; numberIndex < numbers.length; numberIndex += 3) {
          parsedCoordinates.push({
            x: numbers[numberIndex],
            y: numbers[numberIndex + 1],
            z: numbers[numberIndex + 2]
          })
        }
        return
      }

      if (numbers.length < 3) {
        throw new Error(`Не удалось разобрать строку ${index + 1}: "${line}"`)
      }

      parsedCoordinates.push({ x: numbers[0], y: numbers[1], z: numbers[2] })
    })

    return uniqueCoordinates(parsedCoordinates)
  }

  window.BotStudioCoordinateUtils = {
    formatCoordinateValue,
    formatCoordinatesText,
    expandCoordinateRange,
    parseCoordinateToken,
    expandCoordinateSegment,
    uniqueCoordinates,
    parseCoordinatesText
  }
})()
