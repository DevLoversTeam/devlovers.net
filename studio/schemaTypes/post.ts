import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'object',
      fields: [
        defineField({name: 'en', title: 'English', type: 'string'}),
        defineField({name: 'pl', title: 'Polish', type: 'string'}),
        defineField({name: 'uk', title: 'Ukrainian', type: 'string'}),
      ],
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title.en',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: {type: 'author'},
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: {type: 'category'}}],
    }),

    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        layout: 'tags',
      },
      description: 'Topics like "frontend", "backend", "CSS", "testing"...',
    }),

    defineField({
      name: 'resourceLink',
      title: 'Resource Link',
      type: 'url',
      description: 'Optional link to an external resource',
      validation: (Rule) =>
        Rule.uri({
          allowRelative: false,
          scheme: ['http', 'https'],
        }),
    }),

    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'object',
      fields: [
        defineField({
          name: 'en',
          title: 'English',
          type: 'array',
          of: [{type: 'block'}, {type: 'image'}],
        }),
        defineField({
          name: 'pl',
          title: 'Polish',
          type: 'array',
          of: [{type: 'block'}, {type: 'image'}],
        }),
        defineField({
          name: 'uk',
          title: 'Ukrainian',
          type: 'array',
          of: [{type: 'block'}, {type: 'image'}],
        }),
      ],
    }),
  ],

  preview: {
    select: {
      title: 'title.en',
      author: 'author.name.en',
      media: 'mainImage',
    },
    prepare(selection) {
      const {author} = selection
      return {...selection, subtitle: author && `by ${author}`}
    },
  },
})
