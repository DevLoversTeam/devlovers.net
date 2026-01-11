import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'author',
  title: 'Author',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
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
        source: 'name.en',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'object',
      fields: [
        defineField({
          name: 'en',
          title: 'English',
          type: 'array',
          of: [
            {
              title: 'Block',
              type: 'block',
              styles: [{title: 'Normal', value: 'normal'}],
              lists: [],
            },
          ],
        }),
        defineField({
          name: 'pl',
          title: 'Polish',
          type: 'array',
          of: [
            {
              title: 'Block',
              type: 'block',
              styles: [{title: 'Normal', value: 'normal'}],
              lists: [],
            },
          ],
        }),
        defineField({
          name: 'uk',
          title: 'Ukrainian',
          type: 'array',
          of: [
            {
              title: 'Block',
              type: 'block',
              styles: [{title: 'Normal', value: 'normal'}],
              lists: [],
            },
          ],
        }),
      ],
    }),

    defineField({
      name: 'company',
      title: 'Company',
      type: 'object',
      fields: [
        defineField({name: 'en', title: 'English', type: 'string'}),
        defineField({name: 'pl', title: 'Polish', type: 'string'}),
        defineField({name: 'uk', title: 'Ukrainian', type: 'string'}),
      ],
    }),
    defineField({
      name: 'jobTitle',
      title: 'Job Title',
      type: 'object',
      fields: [
        defineField({name: 'en', title: 'English', type: 'string'}),
        defineField({name: 'pl', title: 'Polish', type: 'string'}),
        defineField({name: 'uk', title: 'Ukrainian', type: 'string'}),
      ],
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'object',
      fields: [
        defineField({name: 'en', title: 'English', type: 'string'}),
        defineField({name: 'pl', title: 'Polish', type: 'string'}),
        defineField({name: 'uk', title: 'Ukrainian', type: 'string'}),
      ],
    }),

    defineField({
      name: 'socialMedia',
      title: 'Social Media',
      type: 'array',
      of: [{type: 'socialLink'}],
      description: 'Links to profiles like LinkedIn, GitHub, Twitter...',
    }),
  ],
  preview: {
    select: {
      title: 'name.en',
      media: 'image',
    },
  },
})
