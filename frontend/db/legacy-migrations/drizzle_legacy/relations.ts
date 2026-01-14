import { relations } from "drizzle-orm/relations";
import { users, orders, quizzes, quizQuestions, pointTransactions, products, productPrices, categories, questions, quizAnswers, orderItems, quizAttempts, quizAttemptAnswers, stripeEvents, quizAnswerTranslations, categoryTranslations, questionTranslations, quizTranslations, quizQuestionContent } from "./schema";

export const ordersRelations = relations(orders, ({ one, many }) => ({
	user: one(users, {
		fields: [orders.userId],
		references: [users.id]
	}),
	orderItems: many(orderItems),
	stripeEvents: many(stripeEvents),
}));

export const usersRelations = relations(users, ({ many }) => ({
	orders: many(orders),
	pointTransactions: many(pointTransactions),
	quizAttempts: many(quizAttempts),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one, many }) => ({
	quiz: one(quizzes, {
		fields: [quizQuestions.quizId],
		references: [quizzes.id]
	}),
	quizAnswers: many(quizAnswers),
	quizAttemptAnswers: many(quizAttemptAnswers),
	quizQuestionContents: many(quizQuestionContent),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
	quizQuestions: many(quizQuestions),
	category: one(categories, {
		fields: [quizzes.categoryId],
		references: [categories.id]
	}),
	quizAttempts: many(quizAttempts),
	quizTranslations: many(quizTranslations),
}));

export const pointTransactionsRelations = relations(pointTransactions, ({ one }) => ({
	user: one(users, {
		fields: [pointTransactions.userId],
		references: [users.id]
	}),
}));

export const productPricesRelations = relations(productPrices, ({ one }) => ({
	product: one(products, {
		fields: [productPrices.productId],
		references: [products.id]
	}),
}));

export const productsRelations = relations(products, ({ many }) => ({
	productPrices: many(productPrices),
	orderItems: many(orderItems),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
	category: one(categories, {
		fields: [questions.categoryId],
		references: [categories.id]
	}),
	questionTranslations: many(questionTranslations),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
	questions: many(questions),
	quizzes: many(quizzes),
	categoryTranslations: many(categoryTranslations),
}));

export const quizAnswersRelations = relations(quizAnswers, ({ one, many }) => ({
	quizQuestion: one(quizQuestions, {
		fields: [quizAnswers.quizQuestionId],
		references: [quizQuestions.id]
	}),
	quizAttemptAnswers: many(quizAttemptAnswers),
	quizAnswerTranslations: many(quizAnswerTranslations),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	order: one(orders, {
		fields: [orderItems.orderId],
		references: [orders.id]
	}),
	product: one(products, {
		fields: [orderItems.productId],
		references: [products.id]
	}),
}));

export const quizAttemptsRelations = relations(
	quizAttempts,
	({ one, many }) => ({
		user: one(users, {
			fields: [quizAttempts.userId],
			references: [users.id],
		}),
		quiz: one(quizzes, {
			fields: [quizAttempts.quizId],
			references: [quizzes.id],
		}),
		answers: many(quizAttemptAnswers),
	})
);

export const quizAttemptAnswersRelations = relations(quizAttemptAnswers, ({ one }) => ({
	quizAttempt: one(quizAttempts, {
		fields: [quizAttemptAnswers.attemptId],
		references: [quizAttempts.id]
	}),
	quizQuestion: one(quizQuestions, {
		fields: [quizAttemptAnswers.quizQuestionId],
		references: [quizQuestions.id]
	}),
	quizAnswer: one(quizAnswers, {
		fields: [quizAttemptAnswers.selectedAnswerId],
		references: [quizAnswers.id]
	}),
}));

export const stripeEventsRelations = relations(stripeEvents, ({ one }) => ({
	order: one(orders, {
		fields: [stripeEvents.orderId],
		references: [orders.id]
	}),
}));

export const quizAnswerTranslationsRelations = relations(quizAnswerTranslations, ({ one }) => ({
	quizAnswer: one(quizAnswers, {
		fields: [quizAnswerTranslations.quizAnswerId],
		references: [quizAnswers.id]
	}),
}));

export const categoryTranslationsRelations = relations(categoryTranslations, ({ one }) => ({
	category: one(categories, {
		fields: [categoryTranslations.categoryId],
		references: [categories.id]
	}),
}));

export const questionTranslationsRelations = relations(questionTranslations, ({ one }) => ({
	question: one(questions, {
		fields: [questionTranslations.questionId],
		references: [questions.id]
	}),
}));

export const quizTranslationsRelations = relations(quizTranslations, ({ one }) => ({
	quiz: one(quizzes, {
		fields: [quizTranslations.quizId],
		references: [quizzes.id]
	}),
}));

export const quizQuestionContentRelations = relations(quizQuestionContent, ({ one }) => ({
	quizQuestion: one(quizQuestions, {
		fields: [quizQuestionContent.quizQuestionId],
		references: [quizQuestions.id]
	}),
}));