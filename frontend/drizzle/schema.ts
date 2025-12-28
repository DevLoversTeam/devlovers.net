import { pgTable, foreignKey, unique, check, uuid, text, numeric, jsonb, boolean, timestamp, varchar, integer, index, uniqueIndex, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const currency = pgEnum("currency", ['USD', 'UAH'])
export const paymentStatus = pgEnum("payment_status", ['pending', 'requires_payment', 'paid', 'failed', 'refunded'])
export const productBadge = pgEnum("product_badge", ['NEW', 'SALE', 'NONE'])


export const orders = pgTable("orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id"),
	totalAmount: numeric("total_amount", { precision: 10, scale:  2 }).notNull(),
	currency: currency().default('USD').notNull(),
	paymentStatus: paymentStatus("payment_status").default('pending').notNull(),
	paymentProvider: text("payment_provider").default('stripe').notNull(),
	paymentIntentId: text("payment_intent_id"),
	pspChargeId: text("psp_charge_id"),
	pspPaymentMethod: text("psp_payment_method"),
	pspStatusReason: text("psp_status_reason"),
	pspMetadata: jsonb("psp_metadata").default({}),
	stockRestored: boolean("stock_restored").default(false).notNull(),
	restockedAt: timestamp("restocked_at", { mode: 'string' }),
	idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	totalAmountMinor: integer("total_amount_minor").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "orders_user_id_users_id_fk"
		}).onDelete("set null"),
	unique("orders_idempotency_key_unique").on(table.idempotencyKey),
	check("orders_payment_intent_id_null_when_none", sql`(payment_provider <> 'none'::text) OR (payment_intent_id IS NULL)`),
	check("orders_payment_provider_valid", sql`payment_provider = ANY (ARRAY['stripe'::text, 'none'::text])`),
]);

export const quizQuestions = pgTable("quiz_questions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	quizId: uuid("quiz_id").notNull(),
	displayOrder: integer("display_order").notNull(),
	sourceQuestionId: uuid("source_question_id"),
	difficulty: varchar({ length: 20 }).default('medium'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("quiz_questions_quiz_display_order_idx").using("btree", table.quizId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.quizId],
			foreignColumns: [quizzes.id],
			name: "quiz_questions_quiz_id_quizzes_id_fk"
		}).onDelete("cascade"),
]);

export const products = pgTable("products", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: varchar({ length: 255 }).notNull(),
	title: text().notNull(),
	description: text(),
	imageUrl: text("image_url").notNull(),
	imagePublicId: text("image_public_id"),
	price: numeric({ precision: 10, scale:  2 }).notNull(),
	originalPrice: numeric("original_price", { precision: 10, scale:  2 }),
	currency: currency().default('USD').notNull(),
	category: text(),
	type: text(),
	colors: text().array().default([""]).notNull(),
	sizes: text().array().default([""]).notNull(),
	badge: productBadge().default('NONE').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	stock: integer().default(0).notNull(),
	sku: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("products_slug_unique").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	check("products_stock_non_negative", sql`stock >= 0`),
]);

export const pointTransactions = pgTable("point_transactions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	points: integer().default(0).notNull(),
	source: varchar({ length: 50 }).default('quiz').notNull(),
	sourceId: uuid("source_id"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "point_transactions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const productPrices = pgTable("product_prices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	currency: currency().notNull(),
	price: numeric({ precision: 10, scale:  2 }).notNull(),
	originalPrice: numeric("original_price", { precision: 10, scale:  2 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	priceMinor: integer("price_minor").notNull(),
	originalPriceMinor: integer("original_price_minor"),
}, (table) => [
	index("product_prices_currency_idx").using("btree", table.currency.asc().nullsLast().op("enum_ops")),
	uniqueIndex("product_prices_product_currency_uq").using("btree", table.productId.asc().nullsLast().op("uuid_ops"), table.currency.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_prices_product_id_fkey"
		}).onDelete("cascade"),
	check("product_prices_original_price_valid", sql`(original_price_minor IS NULL) OR (original_price_minor > price_minor)`),
	check("product_prices_price_positive", sql`price_minor > 0`),
]);

export const questions = pgTable("questions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	categoryId: uuid("category_id").notNull(),
	difficulty: varchar({ length: 20 }).default('medium'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "questions_category_id_categories_id_fk"
		}).onDelete("restrict"),
]);

export const quizAnswers = pgTable("quiz_answers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	quizQuestionId: uuid("quiz_question_id").notNull(),
	displayOrder: integer("display_order").notNull(),
	isCorrect: boolean("is_correct").default(false).notNull(),
}, (table) => [
	index("quiz_answers_question_display_order_idx").using("btree", table.quizQuestionId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.quizQuestionId],
			foreignColumns: [quizQuestions.id],
			name: "quiz_answers_quiz_question_id_quiz_questions_id_fk"
		}).onDelete("cascade"),
]);

export const quizzes = pgTable("quizzes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	categoryId: uuid("category_id").notNull(),
	slug: varchar({ length: 100 }).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	questionsCount: integer("questions_count").default(10).notNull(),
	timeLimitSeconds: integer("time_limit_seconds"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "quizzes_category_id_categories_id_fk"
		}).onDelete("restrict"),
	unique("quizzes_category_id_slug_unique").on(table.categoryId, table.slug),
]);

export const categories = pgTable("categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: varchar({ length: 50 }).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("categories_slug_unique").on(table.slug),
]);

export const orderItems = pgTable("order_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id").notNull(),
	productId: uuid("product_id").notNull(),
	quantity: integer().notNull(),
	unitPrice: numeric("unit_price", { precision: 10, scale:  2 }).notNull(),
	lineTotal: numeric("line_total", { precision: 10, scale:  2 }).notNull(),
	productTitle: text("product_title"),
	productSlug: text("product_slug"),
	productSku: text("product_sku"),
	unitPriceMinor: integer("unit_price_minor").notNull(),
	lineTotalMinor: integer("line_total_minor").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "order_items_order_id_orders_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "order_items_product_id_products_id_fk"
		}),
	check("order_items_line_total_consistent", sql`line_total_minor = (unit_price_minor * quantity)`),
	check("order_items_line_total_minor_non_negative", sql`line_total_minor >= 0`),
	check("order_items_quantity_positive", sql`quantity > 0`),
	check("order_items_unit_price_minor_non_negative", sql`unit_price_minor >= 0`),
]);

export const quizAttempts = pgTable("quiz_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	quizId: uuid("quiz_id").notNull(),
	score: integer().notNull(),
	totalQuestions: integer("total_questions").notNull(),
	percentage: numeric({ precision: 5, scale:  2 }).notNull(),
	timeSpentSeconds: integer("time_spent_seconds"),
	integrityScore: integer("integrity_score").default(100),
	metadata: jsonb().default({}),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("quiz_attempts_quiz_integrity_score_idx").using("btree", table.quizId.asc().nullsLast().op("int4_ops"), table.integrityScore.asc().nullsLast().op("int4_ops")),
	index("quiz_attempts_quiz_percentage_completed_at_idx").using("btree", table.quizId.asc().nullsLast().op("uuid_ops"), table.percentage.asc().nullsLast().op("timestamptz_ops"), table.completedAt.asc().nullsLast().op("numeric_ops")),
	index("quiz_attempts_user_completed_at_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.completedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.quizId],
			foreignColumns: [quizzes.id],
			name: "quiz_attempts_quiz_id_quizzes_id_fk"
		}).onDelete("cascade"),
]);

export const quizAttemptAnswers = pgTable("quiz_attempt_answers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	attemptId: uuid("attempt_id").notNull(),
	quizQuestionId: uuid("quiz_question_id").notNull(),
	selectedAnswerId: uuid("selected_answer_id"),
	isCorrect: boolean("is_correct").notNull(),
	answeredAt: timestamp("answered_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("quiz_attempt_answers_attempt_idx").using("btree", table.attemptId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.attemptId],
			foreignColumns: [quizAttempts.id],
			name: "quiz_attempt_answers_attempt_id_quiz_attempts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.quizQuestionId],
			foreignColumns: [quizQuestions.id],
			name: "quiz_attempt_answers_quiz_question_id_quiz_questions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.selectedAnswerId],
			foreignColumns: [quizAnswers.id],
			name: "quiz_attempt_answers_selected_answer_id_quiz_answers_id_fk"
		}).onDelete("set null"),
]);

export const stripeEvents = pgTable("stripe_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().default('stripe').notNull(),
	eventId: text("event_id").notNull(),
	paymentIntentId: text("payment_intent_id"),
	orderId: uuid("order_id"),
	eventType: text("event_type").notNull(),
	paymentStatus: text("payment_status"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("stripe_events_event_id_idx").using("btree", table.eventId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "stripe_events_order_id_orders_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: text().default(gen_random_uuid()).primaryKey().notNull(),
	name: text(),
	email: text().notNull(),
	passwordHash: text("password_hash"),
	emailVerified: timestamp("email_verified", { mode: 'string' }),
	image: text(),
	role: text().default('user').notNull(),
	points: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const quizAnswerTranslations = pgTable("quiz_answer_translations", {
	quizAnswerId: uuid("quiz_answer_id").notNull(),
	locale: varchar({ length: 5 }).notNull(),
	answerText: text("answer_text").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.quizAnswerId],
			foreignColumns: [quizAnswers.id],
			name: "quiz_answer_translations_quiz_answer_id_quiz_answers_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.quizAnswerId, table.locale], name: "quiz_answer_translations_quiz_answer_id_locale_pk"}),
]);

export const categoryTranslations = pgTable("category_translations", {
	categoryId: uuid("category_id").notNull(),
	locale: varchar({ length: 5 }).notNull(),
	title: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "category_translations_category_id_categories_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.categoryId, table.locale], name: "category_translations_category_id_locale_pk"}),
]);

export const questionTranslations = pgTable("question_translations", {
	questionId: uuid("question_id").notNull(),
	locale: varchar({ length: 5 }).notNull(),
	question: text().notNull(),
	answerBlocks: jsonb("answer_blocks").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.questionId],
			foreignColumns: [questions.id],
			name: "question_translations_question_id_questions_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.questionId, table.locale], name: "question_translations_question_id_locale_pk"}),
]);

export const quizTranslations = pgTable("quiz_translations", {
	quizId: uuid("quiz_id").notNull(),
	locale: varchar({ length: 5 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
}, (table) => [
	foreignKey({
			columns: [table.quizId],
			foreignColumns: [quizzes.id],
			name: "quiz_translations_quiz_id_quizzes_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.quizId, table.locale], name: "quiz_translations_quiz_id_locale_pk"}),
]);

export const quizQuestionContent = pgTable("quiz_question_content", {
	quizQuestionId: uuid("quiz_question_id").notNull(),
	locale: varchar({ length: 5 }).notNull(),
	questionText: text("question_text").notNull(),
	explanation: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.quizQuestionId],
			foreignColumns: [quizQuestions.id],
			name: "quiz_question_content_quiz_question_id_quiz_questions_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.quizQuestionId, table.locale], name: "quiz_question_content_quiz_question_id_locale_pk"}),
]);
