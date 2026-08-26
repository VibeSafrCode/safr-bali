const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

for (const button of document.querySelectorAll("[data-youtube-load]")) {
  button.addEventListener("click", () => {
    const videoId = button.dataset.youtubeId ?? "";
    const title = button.dataset.youtubeTitle ?? "SAFRWAY YouTube";
    const card = button.closest("[data-youtube-card]");
    if (!card || !VIDEO_ID.test(videoId) || card.querySelector("iframe")) return;

    const frame = document.createElement("iframe");
    frame.className = "public-youtube-frame";
    frame.title = title;
    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    button.replaceWith(frame);
  }, { once: true });
}
