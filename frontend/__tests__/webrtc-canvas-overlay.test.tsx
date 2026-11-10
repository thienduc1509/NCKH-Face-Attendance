import {
  computeBoundingBox,
  DetectionFace,
  DetectionPayload,
} from "@/components/webrtc-stream"

describe("WebRTC Canvas Bounding Box & Coordinate Transformation", () => {
  const canvasWidth = 640
  const canvasHeight = 480

  describe("1. Coordinate Transformation & Normalization", () => {
    it("should transform normalized coordinates directly to canvas pixel space", () => {
      const face: DetectionFace = {
        bbox: [100, 50, 200, 150],
        bbox_normalized: [0.2, 0.1, 0.3, 0.4],
        student_id: "SV001",
        student_name: "Tran Van Giang",
        score: 0.85,
        recognized: true,
      }

      const res = computeBoundingBox(face, canvasWidth, canvasHeight, false)
      expect(res.boxX).toBeCloseTo(0.2 * 640, 2) // 128
      expect(res.boxY).toBeCloseTo(0.1 * 480, 2) // 48
      expect(res.boxW).toBeCloseTo(0.3 * 640, 2) // 192
      expect(res.boxH).toBeCloseTo(0.4 * 480, 2) // 192
    })

    it("should compute normalized coordinates from raw pixel bbox when bbox_normalized is missing", () => {
      const face: DetectionFace = {
        bbox: [160, 120, 320, 240], // exactly 0.25, 0.25, 0.5, 0.5 of 640x480
        student_id: "SV002",
        student_name: "Le Hong Phuc",
        score: 0.78,
        recognized: true,
      }

      const res = computeBoundingBox(face, canvasWidth, canvasHeight, false, 640, 480)
      expect(res.boxX).toBeCloseTo(160, 2)
      expect(res.boxY).toBeCloseTo(120, 2)
      expect(res.boxW).toBeCloseTo(320, 2)
      expect(res.boxH).toBeCloseTo(240, 2)
    })
  })

  describe("2. Webcam Mirroring Horizontal Inversion", () => {
    it("should horizontally invert X coordinate when isMirrored is true", () => {
      // Face positioned on the right side of sensor: x=448, w=128 (norm_x=0.7, norm_w=0.2)
      const face: DetectionFace = {
        bbox: [448, 100, 128, 150],
        bbox_normalized: [0.7, 0.2, 0.2, 0.3],
        student_id: "SV001",
        student_name: "Tran Van Giang",
        score: 0.82,
        recognized: true,
      }

      // Non-mirrored
      const unmirrored = computeBoundingBox(face, canvasWidth, canvasHeight, false)
      expect(unmirrored.boxX).toBeCloseTo(0.7 * 640, 2) // 448
      expect(unmirrored.boxW).toBeCloseTo(0.2 * 640, 2) // 128

      // Mirrored: canvas.width - (norm_x * canvas.width + boxW)
      // = 640 - (448 + 128) = 640 - 576 = 64
      const mirrored = computeBoundingBox(face, canvasWidth, canvasHeight, true)
      expect(mirrored.boxX).toBeCloseTo(64, 2)
      expect(mirrored.boxW).toBeCloseTo(128, 2)
      expect(mirrored.boxY).toBeCloseTo(unmirrored.boxY, 2)
    })

    it("should keep center face symmetrically centered when mirrored", () => {
      // Center face: norm_x = 0.4, norm_w = 0.2 (occupies [0.4, 0.6] of width)
      const face: DetectionFace = {
        bbox: [256, 100, 128, 150],
        bbox_normalized: [0.4, 0.2, 0.2, 0.3],
        student_id: "SV001",
        student_name: "Tran Van Giang",
        score: 0.9,
        recognized: true,
      }

      const unmirrored = computeBoundingBox(face, canvasWidth, canvasHeight, false)
      const mirrored = computeBoundingBox(face, canvasWidth, canvasHeight, true)

      // 640 - (0.4*640 + 0.2*640) = 640 - (256 + 128) = 256
      expect(mirrored.boxX).toBeCloseTo(unmirrored.boxX, 2)
    })
  })

  describe("3. Green / Red Bounding Box Classification & Styling", () => {
    it("should assign green color #22C55E and formatted MSSV - Họ tên for recognized student", () => {
      const face: DetectionFace = {
        bbox: [100, 100, 150, 150],
        bbox_normalized: [0.15, 0.2, 0.23, 0.31],
        student_id: "20200001",
        student_name: "Tran Van Giang",
        score: 0.754,
        recognized: true,
      }

      const res = computeBoundingBox(face, canvasWidth, canvasHeight, false)
      expect(res.color).toBe("#22C55E")
      expect(res.label).toContain("20200001 - Tran Van Giang")
      expect(res.label).toContain("(75%)")
    })

    it("should assign red color #EF4444 and Unknown label for unrecognized stranger", () => {
      const face: DetectionFace = {
        bbox: [200, 100, 150, 150],
        bbox_normalized: [0.3, 0.2, 0.23, 0.31],
        student_id: null,
        student_name: null,
        score: 0.18,
        recognized: false,
      }

      const res = computeBoundingBox(face, canvasWidth, canvasHeight, false)
      expect(res.color).toBe("#EF4444")
      expect(res.label).toBe("Unknown")
    })
  })

  describe("4. WebRTC DataChannel Payload Parsing & Debounce Contracts", () => {
    it("should parse DataChannel JSON message with multiple faces", () => {
      const rawJson = JSON.stringify({
        type: "faces_detected",
        timestamp: 1731234567.89,
        faces: [
          {
            bbox: [100, 80, 120, 140],
            bbox_normalized: [0.156, 0.166, 0.187, 0.291],
            student_id: "20200001",
            student_name: "Tran Van Giang",
            score: 0.84,
            recognized: true,
            attendance_status: "ALREADY_ATTENDED",
          },
          {
            bbox: [380, 90, 110, 135],
            bbox_normalized: [0.593, 0.187, 0.171, 0.281],
            student_id: null,
            student_name: null,
            score: 0.22,
            recognized: false,
            attendance_status: "UNRECOGNIZED",
          },
        ],
      })

      const payload: DetectionPayload = JSON.parse(rawJson)
      expect(payload.faces).toHaveLength(2)

      const f0 = payload.faces[0]
      const f1 = payload.faces[1]

      const b0 = computeBoundingBox(f0, canvasWidth, canvasHeight, false)
      const b1 = computeBoundingBox(f1, canvasWidth, canvasHeight, false)

      expect(b0.color).toBe("#22C55E")
      expect(b0.label).toContain("Tran Van Giang")
      expect(b1.color).toBe("#EF4444")
      expect(b1.label).toBe("Unknown")
    })

    it("should identify newly confirmed attendance in DataChannel payload", () => {
      const payload: DetectionPayload = {
        faces: [
          {
            bbox: [100, 80, 120, 140],
            student_id: "20200001",
            student_name: "Tran Van Giang",
            score: 0.81,
            recognized: true,
            attendance_status: "NEWLY_MARKED",
          },
        ],
        attendance_confirmed: {
          student_id: "20200001",
          student_name: "Tran Van Giang",
        },
      }

      expect(payload.attendance_confirmed).toBeDefined()
      expect(payload.attendance_confirmed?.student_id).toBe("20200001")
      expect(payload.attendance_confirmed?.student_name).toBe("Tran Van Giang")
    })

    it("should handle empty face detections cleanly", () => {
      const payload: DetectionPayload = {
        faces: [],
      }
      expect(payload.faces).toHaveLength(0)
    })
  })
})
