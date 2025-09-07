<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-type, Range");
header("Access-Control-Expose-Headers: Content-Length, Content-Range");

$uri = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$path = __DIR__ . $uri;

if (is_file($path)) {
    $ext = pathinfo($path, PATHINFO_EXTENSION);

    switch ($ext) {
        case 'm3u8':
            header("Content-Type: application/vnd.apple.mpegurl");
            break;
        case 'ts':
            header("Content-Type: video/mp2t");
            break;
    }

    readfile($path);
    exit;
}

http_response_code(404);
echo "Not found";
