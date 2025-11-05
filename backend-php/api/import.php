<?php
require_once '../config.php';

if (!isset($_POST['category']) || !isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing category or file']);
    exit;
}

$category = sanitize($_POST['category']);
$allowedCategories = ['Brass', 'Iron', 'Wood', 'Tanjore Paintings'];

if (!in_array($category, $allowedCategories)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid category']);
    exit;
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'File upload failed']);
    exit;
}

// Read CSV
$csvData = array_map('str_getcsv', file($file['tmp_name']));
$header = array_shift($csvData);

$db = getDB();

try {
    $db->beginTransaction();

    // Delete existing items for this category
    $deleteStmt = $db->prepare("DELETE FROM inventory WHERE category = ?");
    $deleteStmt->execute([$category]);

    // Insert new items
    $insertStmt = $db->prepare("
        INSERT INTO inventory (category, item_code, particulars, size, weight, tag_id) 
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            item_code = VALUES(item_code),
            particulars = VALUES(particulars),
            size = VALUES(size),
            weight = VALUES(weight)
    ");

    $imported = 0;
    foreach ($csvData as $row) {
        if (count($row) >= 5 && !empty($row[0])) {
            $insertStmt->execute([
                $category,
                sanitize($row[0]), // ITEM CODE
                sanitize($row[1]), // PARTICULARS
                sanitize($row[2]), // SIZE
                sanitize($row[3]), // Weight
                sanitize($row[4])  // TAG ID
            ]);
            $imported++;
        }
    }

    $db->commit();

    echo json_encode([
        'success' => true, 
        'message' => "Imported $imported items for $category"
    ]);

} catch (Exception $e) {
    $db->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Import failed: ' . $e->getMessage()]);
}
?>
