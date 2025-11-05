<?php
require_once '../config.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['pin']) || strlen($data['pin']) !== 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid PIN format']);
    exit;
}

$pin = sanitize($data['pin']);

// Verify PIN
if (password_verify($pin, PIN_HASH)) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid PIN']);
}
?>
