# Eval Evidence — Arionear (Arionear)

> ≥5 manual test cases với output thật từ LLM (không mock)  
> **Ngày chạy:** 2026-06-17 16:34:34  
> **Raw data:** `[_live_outputs.json](./_live_outputs.json)`

**Môi trường:** Session `e2a464d9-825c-4eaa-93db-c8c56c578521` · Agent Ario v1.0 · OpenRouter · PostgreSQL · Health `ok`

---

## Tổng hợp


| ID  | Task        | Endpoint                        | HTTP | Latency | Pass                        |
| --- | ----------- | ------------------------------- | ---- | ------- | --------------------------- |
| TC1 | `chat`      | `POST /api/v1/chat`             | 200  | 5.55s   | ✅                           |
| TC2 | `style`     | `POST /api/v1/chat`             | 200  | 3.33s   | ✅                           |
| TC3 | `structure` | `POST /api/v1/chat`             | 200  | 3.51s   | ✅                           |
| TC4 | `template`  | `POST /api/v1/chat`             | 200  | 4.87s   | ✅                           |
| TC5 | compile     | `POST /api/v1/compile`          | 200  | —       | ⚠️ API OK, `success: false` |
| TC6 | citation    | `POST /api/v1/citations/verify` | 200  | —       | ✅                           |


**Kết luận:** 6/6 test cases có real output · 5/6 đạt kỳ vọng chức năng.

---

## TC1 — Chat

**Input:**

```json
{
  "message": "Giải thích ngắn gọn abstract của bài này bằng tiếng Việt",
  "task": "chat"
}
```

**Output:**

> Abstract của bài này nêu rằng các mô hình học máy đạt được kết quả tốt nhưng thường thiếu tính giải thích. Điều này có nghĩa là mặc dù các mô hình này có thể dự đoán chính xác, nhưng người dùng khó hiểu được cách mà chúng đưa ra quyết định.

---

## TC2 — Style

**Input:**

```json
{
  "message": "Chỉnh sửa abstract cho văn phong học thuật hơn",
  "task": "style"
}
```

**Output:**


| Trường            | Giá trị                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `suggestion`      | Machine learning models demonstrate impressive performance; however, they frequently suffer from a lack of interpretability. |
| `apply_mode`      | `selection`                                                                                                                  |
| `revision_id`     | `9ec6da1e-b221-4efd-a6f8-93ceb856f001`                                                                                       |
| `integrity_flags` | `[]`                                                                                                                         |


```diff
-Machine learning models achieve strong results but often lack interpretability.
+Machine learning models demonstrate impressive performance; however, they frequently suffer from a lack of interpretability.
```

---

## TC3 — Structure

**Input:**

```json
{
  "message": "Phân tích cấu trúc IMRaD của bài này",
  "task": "structure"
}
```

**Output:**

> Gợi ý cấu trúc:  
>
> - [WARNING] Conclusion: Consider adding a Conclusion section.

```json
{
  "type": "missing",
  "section": "Conclusion",
  "message": "Consider adding a Conclusion section.",
  "severity": "warning"
}
```

---

## TC4 — Template

**Input:**

```json
{
  "message": "Thêm các section IMRaD còn thiếu",
  "task": "template"
}
```

**Output:**

> Để hoàn thiện cấu trúc IMRaD (Introduction, Methods, Results, and Discussion), bạn cần thêm các phần sau:
>
> 1. **Methods** — Mô tả phương pháp nghiên cứu mà bạn đã sử dụng.
> 2. **Results** — Trình bày kết quả thu được từ nghiên cứu.
> 3. **Discussion** — Thảo luận về ý nghĩa của kết quả, so sánh với các nghiên cứu trước đây và đưa ra kết luận.
>
> Bạn có muốn tôi giúp bạn viết một trong các phần này không?

---

## TC5 — Compile

**Input:** `POST /api/v1/compile`

**Output:**


| Trường              | Giá trị    |
| ------------------- | ---------- |
| HTTP                | 200        |
| `success`           | `false`    |
| `engine`            | `pdflatex` |
| `pdf_base64_length` | 0          |


**Error (rút gọn):**

```
MiKTeX could not find the script engine 'perl' which is required to execute 'latexmk'.
! LaTeX Error: There's no line here to end. (\\documentclass — escape kép trong payload)
```

---

## TC6 — Citation

**Input:**

```json
{
  "session_id": "e2a464d9-825c-4eaa-93db-c8c56c578521"
}
```

**Output:**

```json
{
  "results": [
    {
      "key": "smith2020",
      "status": "not_found",
      "message": "Insufficient metadata to verify."
    }
  ],
  "summary": "Verified 0/1 citations."
}
```

