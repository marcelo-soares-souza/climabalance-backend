import { z } from 'zod';

const SEQUENCES = [
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  'abcd', 'bcde', 'cdef', 'defg', 'efgh', 'fghi', 'ghij', 'hijk',
  'ijkl', 'jklm', 'klmn', 'lmno', 'mnop', 'nopq', 'opqr', 'pqrs',
  'qrst', 'rstu', 'stuv', 'tuvw', 'uvwx', 'vwxy', 'wxyz',
  'zyxw', 'yxwv', 'xwvu', 'wvut', 'vuts', 'utsr', 'tsrq', 'srqp',
  'rqpo', 'qpon', 'ponm', 'onml', 'nmlk', 'mlkj', 'lkji', 'kjih',
  'jihg', 'ihgf', 'hgfe', 'gfed', 'fedc', 'edcb', 'dcba',
  'ZYXW', 'YXWV', 'XWVU', 'WVUT', 'VUTS', 'UTSR', 'TSRQ', 'SRQP',
  'RQPO', 'QPON', 'PONM', 'ONML', 'NMLK', 'MLKJ', 'LKJI', 'KJIH',
  'JIHG', 'IHGF', 'HGFE', 'GFED', 'FEDC', 'EDCB', 'DCBA',
  'ABCD', 'BCDE', 'CDEF', 'DEFG', 'EFGH', 'FGHI', 'GHIJ', 'HIJK',
  'IJKL', 'JKLM', 'KLMN', 'LMNO', 'MNOP', 'NOPQ', 'OPQR', 'PQRS',
  'QRST', 'RSTU', 'STUV', 'TUVW', 'UVWX', 'VWXY', 'WXYZ',
];

function hasSequential(password: string): boolean {
  const lower = password.toLowerCase();
  for (const seq of SEQUENCES) {
    if (lower.includes(seq)) return true;
  }
  return false;
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(320, { message: 'too_long' })
  .email({ message: 'invalid_email' })
  .transform(email => email.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, { message: 'too_short' })
  .max(200, { message: 'too_long' })
  .refine((val) => /[0-9]/.test(val), { message: 'password_no_number' })
  .refine((val) => /[!@#$%^&*(),.?":{}|<>_\-[\]\\/`~]/.test(val), { message: 'password_no_special' })
  .refine((val) => !hasSequential(val), { message: 'password_sequential' });

export const localeSchema = z
  .string()
  .min(1)
  .max(10)
  .optional();

export const tokenSchema = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(500, { message: 'too_long' });
