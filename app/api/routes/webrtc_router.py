import logging
import uuid

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaBlackhole
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.services.webrtc_manager import WebRTCManager, get_webrtc_manager
from app.webrtc.webrtc import VideoTransformTrack

root_logger = logging.getLogger("app")

router = APIRouter(prefix="/webrtc", tags=["webrtc"])


@router.post("/offers")
async def offer(
    request: Request,
    manager: WebRTCManager = Depends(get_webrtc_manager),
):
    pc: RTCPeerConnection | None = None
    try:
        try:
            params = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

        sdp = params.get("sdp") if isinstance(params, dict) else None
        offer_type = params.get("type") if isinstance(params, dict) else None
        class_session_id = (
            params.get("class_session_id") if isinstance(params, dict) else None
        )

        if not sdp or not offer_type:
            raise HTTPException(
                status_code=422, detail="Missing required fields: sdp, type"
            )

        try:
            offer = RTCSessionDescription(sdp=sdp, type=offer_type)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid WebRTC offer") from exc

        pc = RTCPeerConnection()
        pc_id = f"PeerConnection({uuid.uuid4()})"
        manager.add_peer_connection(pc)

        def log_info(msg, *args):
            root_logger.info(pc_id + " " + msg, *args)

        # Media recorder
        recorder = MediaBlackhole()

        # Track reference holders for bi-directional binding
        vt_holder: list[VideoTransformTrack] = []
        dc_holder: list[any] = []

        @pc.on("datachannel")
        def on_datachannel(channel):
            manager.add_data_channel(channel)
            dc_holder.append(channel)
            log_info("DataChannel %s received, state: %s", getattr(channel, "label", "unknown"), getattr(channel, "readyState", "unknown"))

            if vt_holder:
                vt_holder[0].set_data_channel(channel)

            @channel.on("open")
            def on_open():
                log_info("DataChannel %s opened", getattr(channel, "label", "unknown"))
                if vt_holder:
                    vt_holder[0].set_data_channel(channel)

            @channel.on("close")
            def on_close():
                log_info("DataChannel %s closed", getattr(channel, "label", "unknown"))
                manager.discard_data_channel(channel)
                if vt_holder:
                    vt_holder[0].set_data_channel(None)

            @channel.on("message")
            def on_message(message):
                if isinstance(message, str) and message.startswith("ping"):
                    channel.send("pong" + message[4:])

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            log_info("Connection state is %s", pc.connectionState)
            if pc.connectionState == "failed":
                await pc.close()
                manager.discard_peer_connection(pc)

        @pc.on("track")
        def on_track(track):
            log_info("Track %s received", track.kind)

            if track.kind == "video":
                active_dc = dc_holder[0] if dc_holder else None
                vt = VideoTransformTrack(
                    manager.relay.subscribe(track),
                    class_session_id=class_session_id,
                    data_channel=active_dc,
                )
                vt_holder.append(vt)
                pc.addTrack(vt)

            @track.on("ended")
            async def on_ended():
                log_info("Track %s ended", track.kind)
                await recorder.stop()

        # Handle WebRTC offer
        await pc.setRemoteDescription(offer)
        await recorder.start()

        # Send answer
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        if pc.localDescription is None or not pc.localDescription.sdp:
            raise HTTPException(status_code=500, detail="Failed to generate SDP answer")

        return JSONResponse(
            {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
        )
    except HTTPException:
        if pc is not None:
            manager.discard_peer_connection(pc)
            await pc.close()
        raise
    except Exception:
        if pc is not None:
            manager.discard_peer_connection(pc)
            await pc.close()
        root_logger.exception("Unexpected error while processing /webrtc/offers")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while processing WebRTC offer",
        ) from None


@router.post("/messages", include_in_schema=False)
async def message(
    request: Request,
    manager: WebRTCManager = Depends(get_webrtc_manager),
):
    try:
        try:
            params = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

        message_text = params.get("message") if isinstance(params, dict) else None
        if not message_text:
            raise HTTPException(
                status_code=422, detail="Missing required field: message"
            )

        for dc in manager.dcs:
            dc.send(message_text)

        return JSONResponse({"message": "Message sent"})
    except HTTPException:
        raise
    except Exception:
        root_logger.exception("Unexpected error while processing /webrtc/messages")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while sending message",
        ) from None
