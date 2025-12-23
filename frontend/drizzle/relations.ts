import { relations } from "drizzle-orm/relations";
import { categories, questions, quizQuestions, quizAnswers, quizzes, quizAttempts, quizAttemptAnswers, user, pointTransactions, quizAnswerTranslations, quizQuestionContent, quizTranslations } from "./schema";

export const questionsRelations = relations(questions, ({one}) => ({
	category: one(categories, {
		fields: [questions.categoryId],
		references: [categories.id]
	}),
}));

export const categoriesRelations = relations(categories, ({many}) => ({
	questions: many(questions),
}));

export const quizAnswersRelations = relations(quizAnswers, ({one, many}) => ({
	quizQuestion: one(quizQuestions, {
		fields: [quizAnswers.quizQuestionId],
		references: [quizQuestions.id]
	}),
	quizAttemptAnswers: many(quizAttemptAnswers),
	quizAnswerTranslations: many(quizAnswerTranslations),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({one, many}) => ({
	quizAnswers: many(quizAnswers),
	quiz: one(quizzes, {
		fields: [quizQuestions.quizId],
		references: [quizzes.id]
	}),
	quizAttemptAnswers: many(quizAttemptAnswers),
	quizQuestionContents: many(quizQuestionContent),
}));

export const quizzesRelations = relations(quizzes, ({many}) => ({
	quizQuestions: many(quizQuestions),
	quizAttempts: many(quizAttempts),
	quizTranslations: many(quizTranslations),
}));

export const quizAttemptAnswersRelations = relations(quizAttemptAnswers, ({one}) => ({
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

export const quizAttemptsRelations = relations(quizAttempts, ({one, many}) => ({
	quizAttemptAnswers: many(quizAttemptAnswers),
	quiz: one(quizzes, {
		fields: [quizAttempts.quizId],
		references: [quizzes.id]
	}),
}));

export const pointTransactionsRelations = relations(pointTransactions, ({one}) => ({
	user: one(user, {
		fields: [pointTransactions.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	pointTransactions: many(pointTransactions),
}));

export const quizAnswerTranslationsRelations = relations(quizAnswerTranslations, ({one}) => ({
	quizAnswer: one(quizAnswers, {
		fields: [quizAnswerTranslations.quizAnswerId],
		references: [quizAnswers.id]
	}),
}));

export const quizQuestionContentRelations = relations(quizQuestionContent, ({one}) => ({
	quizQuestion: one(quizQuestions, {
		fields: [quizQuestionContent.quizQuestionId],
		references: [quizQuestions.id]
	}),
}));

export const quizTranslationsRelations = relations(quizTranslations, ({one}) => ({
	quiz: one(quizzes, {
		fields: [quizTranslations.quizId],
		references: [quizzes.id]
	}),
}));