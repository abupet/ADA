# Report audit: backend functions non esposte/consumate dal frontend

Data: 2026-02-22

## Sintesi esecutiva
- Endpoint backend rilevati staticamente: **210**.
- Riferimenti endpoint frontend rilevati staticamente: **106** pattern normalizzati.
- Endpoint backend senza riferimento statico nel frontend: **122** (**58.1%**).
- Nota: analisi statica conservativa; possibili falsi positivi se URL costruiti dinamicamente.

## Metodologia
1. Estrazione route da `backend/src/*.js` con pattern `router.METHOD("/api/...`)` o `app.METHOD(...)`.
2. Estrazione stringhe `/api/...` in `frontend/*.js`.
3. Matching normalizzato (query rimossa, placeholder `:id`/`${...}` uniformati a `:param`).
4. Classificazione per modulo backend e identificazione moduli totalmente non referenziati.

## Moduli backend totalmente non referenziati dal frontend
- `backend/src/admin.routes.js`: 1 endpoint
- `backend/src/chatbot.routes.js`: 4 endpoint
- `backend/src/comm-upload.routes.js`: 2 endpoint
- `backend/src/nutrition.routes.js`: 6 endpoint
- `backend/src/preventive-care.routes.js`: 5 endpoint
- `backend/src/rbac.middleware.js`: 1 endpoint
- `backend/src/referral.routes.js`: 5 endpoint
- `backend/src/transcription.routes.js`: 3 endpoint

## Possibili bug / gap ad alta priorità
- **Ruoli incoerenti** tra specifica e backend: uso misto di `owner` e `proprietario` (rischio autorizzazioni incoerenti).
- **Naming parametri disallineato** (`:pet_id` vs `:petId`) su API pets: rischio confusione integrazione e test.
- Presenza di endpoint funzionali completi (es. `nutrition`, `preventive-care`, `referrals`, `chatbot`, `transcription`) senza referenze statiche frontend: possibile codice non raggiungibile o feature non collegate.

## Dettaglio endpoint backend senza riferimento frontend

### backend/src/admin.routes.js (1)
- L886 `GET /api/promo-items/:itemId/image`

### backend/src/api-keys.routes.js (2)
- L75 `DELETE /api/developer/keys/:keyId/revoke`
- L156 `DELETE /api/developer/webhooks/:webhookId`

### backend/src/booking.routes.js (4)
- L39 `GET /api/booking/slots`
- L124 `PATCH /api/booking/appointments/:appointmentId/cancel`
- L142 `POST /api/booking/bulk`
- L177 `POST /api/booking/admin/slots`

### backend/src/breeder.routes.js (15)
- L83 `PATCH /api/breeder/litters/:litterId`
- L103 `POST /api/breeder/litters/:litterId/puppies`
- L134 `PATCH /api/breeder/pets/:petId/sale`
- L155 `GET /api/breeder/programs`
- L171 `POST /api/breeder/programs/:programId/enroll`
- L199 `GET /api/breeder/enrollments`
- L219 `GET /api/breeder/vaccinations/due`
- L239 `GET /api/breeder/litters/:litterId/milestones`
- L256 `PATCH /api/breeder/milestones/:milestoneId`
- L280 `POST /api/breeder/litters/:litterId/generate-milestones`
- L317 `GET /api/breeder/pets/:petId/weights`
- L334 `POST /api/breeder/pets/:petId/weights`
- L356 `POST /api/breeder/pets/:petId/passport/generate`
- L408 `GET /api/breeder/pets/:petId/passport`
- L424 `POST /api/breeder/programs/auto-schedule`

### backend/src/chatbot.routes.js (4)
- L217 `GET /api/chatbot/sessions/:id`
- L263 `POST /api/chatbot/sessions/:id/message`
- L440 `POST /api/chatbot/sessions/:id/close`
- L499 `DELETE /api/chatbot/sessions/:id`

### backend/src/comm-upload.routes.js (2)
- L165 `GET /api/communication/attachments/:id`
- L231 `GET /api/communication/attachments/:id/download`

### backend/src/communication.routes.js (10)
- L242 `GET /api/communication/users/:id/presence`
- L360 `POST /api/communication/conversations/:id/end-call`
- L652 `GET /api/communication/conversations/:id`
- L667 `PATCH /api/communication/conversations/:id`
- L701 `GET /api/communication/conversations/:id/messages`
- L762 `POST /api/communication/conversations/:id/messages`
- L959 `PATCH /api/communication/messages/:id/read`
- L981 `POST /api/communication/conversations/:id/read`
- L1005 `PATCH /api/communication/messages/:id/delete`
- L1095 `POST /api/communication/conversations/:id/calls/:callId/reject`

### backend/src/diagnostics.routes.js (3)
- L14 `GET /api/diagnostics/panels`
- L65 `PATCH /api/diagnostics/results/:resultId`
- L192 `PATCH /api/diagnostics/notifications/read`

### backend/src/documents.routes.js (6)
- L202 `GET /api/documents/:id`
- L226 `GET /api/documents/:id/download`
- L261 `POST /api/documents/:id/read`
- L299 `POST /api/documents/:id/explain`
- L360 `DELETE /api/documents/:id`
- L393 `GET /api/documents/:id/status`

### backend/src/education.routes.js (2)
- L69 `POST /api/education/courses/:courseId/enroll`
- L136 `GET /api/education/ecm/credits`

### backend/src/genetic-tests.routes.js (2)
- L100 `PATCH /api/genetic-tests/orders/:orderId`
- L152 `GET /api/genetic-tests/breeding-report/:breederId`

### backend/src/insurance.routes.js (6)
- L109 `GET /api/insurance/risk-score/:petId`
- L135 `GET /api/insurance/coverage/:petId`
- L154 `POST /api/insurance/quote/:petId`
- L223 `POST /api/insurance/policy/:policyId/activate`
- L245 `POST /api/insurance/claim/:petId`
- L281 `GET /api/insurance/claims/:petId`

### backend/src/knowledge.routes.js (5)
- L111 `GET /api/superadmin/knowledge/books/:bookId`
- L145 `PUT /api/superadmin/knowledge/books/:bookId`
- L186 `DELETE /api/superadmin/knowledge/books/:bookId`
- L209 `POST /api/superadmin/knowledge/books/:bookId/reprocess`
- L376 `GET /api/superadmin/knowledge/chunks/:bookId/browse`

### backend/src/loyalty.routes.js (4)
- L84 `GET /api/loyalty/transactions`
- L106 `PATCH /api/loyalty/admin/fees/:feeId/approve`
- L128 `PATCH /api/loyalty/admin/fees/:feeId/pay`
- L159 `POST /api/loyalty/admin/evaluate-levels`

### backend/src/marketplace.routes.js (3)
- L139 `GET /api/marketplace/orders/:orderId`
- L169 `GET /api/marketplace/subscriptions`
- L193 `GET /api/marketplace/admin/orders`

### backend/src/nutrition.routes.js (6)
- L23 `GET /api/nutrition/products`
- L53 `GET /api/nutrition/plan/:petId`
- L71 `GET /api/nutrition/plan/:petId/pending`
- L88 `GET /api/nutrition/plan/:petId/inputs`
- L127 `POST /api/nutrition/plan/:petId/generate`
- L256 `GET /api/nutrition/plans/:petId/all`

### backend/src/pets.routes.js (4)
- L56 `GET /api/pets/:pet_id`
- L135 `PATCH /api/pets/:pet_id`
- L223 `DELETE /api/pets/:pet_id`
- L281 `POST /api/pets/:petId/ai-description`

### backend/src/preventive-care.routes.js (5)
- L14 `GET /api/preventive-care/plans/:petId`
- L46 `POST /api/preventive-care/plans/:petId/generate`
- L174 `PATCH /api/preventive-care/plans/:planId/approve`
- L196 `PATCH /api/preventive-care/items/:itemId/complete`
- L218 `GET /api/preventive-care/breeder/overview`

### backend/src/promo.routes.js (6)
- L804 `POST /api/promo/event`
- L955 `DELETE /api/promo/vet-flag/:flagId`
- L986 `GET /api/promo/items/:id`
- L1204 `POST /api/promo/ai-match`
- L1367 `POST /api/promo/analyze-match`
- L1509 `POST /api/admin/:tenant_id/bulk-ai-analysis`

### backend/src/push.routes.js (3)
- L43 `DELETE /api/push/unsubscribe`
- L61 `GET /api/push/preferences`
- L90 `PATCH /api/push/preferences`

### backend/src/rbac.middleware.js (1)
- L15 `GET /api/admin/:tenantId/items`

### backend/src/referral-analytics.routes.js (2)
- L79 `GET /api/referral-analytics/timeline`
- L106 `GET /api/referral-analytics/patients`

### backend/src/referral.routes.js (5)
- L40 `POST /api/referrals`
- L67 `GET /api/referrals`
- L103 `GET /api/referrals/:referralId`
- L123 `PATCH /api/referrals/:referralId/status`
- L164 `GET /api/referrals/analytics/summary`

### backend/src/seed.routes.js (2)
- L67 `GET /api/seed/config`
- L157 `POST /api/seed/insurance/load-plans`

### backend/src/server.js (1)
- L183 `GET /api/health`

### backend/src/teleconsult.routes.js (4)
- L21 `POST /api/teleconsult/request`
- L102 `PATCH /api/teleconsult/sessions/:sessionId`
- L164 `POST /api/teleconsult/sessions/:sessionId/note`
- L199 `PATCH /api/teleconsult/notes/:noteId/share`

### backend/src/tips-sources.routes.js (7)
- L174 `POST /api/tips-sources/auto-refresh`
- L237 `GET /api/tips-sources/:id/check-live`
- L294 `GET /api/tips-sources/:id`
- L328 `PUT /api/tips-sources/:id`
- L360 `DELETE /api/tips-sources/:id`
- L372 `POST /api/tips-sources/:id/crawl`
- L402 `POST /api/tips-sources/:id/validate`

### backend/src/transcription.routes.js (3)
- L31 `POST /api/communication/recordings/:conversationId`
- L52 `POST /api/communication/transcribe/:recordingId`
- L129 `GET /api/communication/recordings/:conversationId`

### backend/src/vaccination-reminder.routes.js (4)
- L37 `GET /api/vaccinations/reminders`
- L58 `POST /api/vaccinations/reminders/generate`
- L115 `GET /api/vaccinations/compliance/:breederId`
- L135 `POST /api/vaccinations/compliance/generate`
