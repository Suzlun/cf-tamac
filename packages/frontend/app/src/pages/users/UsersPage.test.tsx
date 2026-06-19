import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach } from 'vitest';

import { server } from '../../tests/mocks/server';
import { render, screen, waitFor } from '../../tests/utils/test-utils';

import { UsersPage } from './UsersPage';

describe('UsersPage', () => {
  describe('データ取得', () => {
    it('ローディング中にスピナーが表示される', () => {
      render(<UsersPage />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('ユーザー一覧が正しく表示される', async () => {
      render(<UsersPage />);

      // ローディングが完了するまで待つ
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // テーブルが表示されることを確認
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      // ヘッダーの確認
      expect(screen.getByRole('columnheader', { name: /id/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /email/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /created at/i })).toBeInTheDocument();

      // ユーザーデータの確認
      const rows = screen.getAllByRole('row');
      // ヘッダー行 + 2データ行 = 3行
      expect(rows).toHaveLength(3);

      // 1人目のユーザー
      expect(screen.getByText('Test User 1')).toBeInTheDocument();
      expect(screen.getByText('test1@example.com')).toBeInTheDocument();

      // 2人目のユーザー
      expect(screen.getByText('Test User 2')).toBeInTheDocument();
      expect(screen.getByText('test2@example.com')).toBeInTheDocument();
    });

    it('ユーザーが0件の場合、メッセージが表示される', async () => {
      // 空の配列を返すようにモックを上書き
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json([]);
        })
      );

      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      expect(screen.getByText(/no users found/i)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('API エラー時にエラーメッセージが表示される', async () => {
      // エラーを返すようにモックを上書き
      server.use(
        http.get('/api/v1/users', () => {
          return HttpResponse.json({ message: 'Failed to fetch users' }, { status: 500 });
        })
      );

      render(<UsersPage />);

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      expect(screen.getByText(/error loading users/i)).toBeInTheDocument();
    });
  });

  describe('ユーザー作成', () => {
    beforeEach(() => {
      render(<UsersPage />);
    });

    it('フォームが正しく表示される', async () => {
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // フォーム要素の確認
      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });

    it('新しいユーザーを作成できる', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // フォームに入力
      const nameInput = screen.getByPlaceholderText('Name');
      const emailInput = screen.getByPlaceholderText('Email');
      const submitButton = screen.getByRole('button', { name: /create user/i });

      await user.type(nameInput, 'New Test User');
      await user.type(emailInput, 'newuser@example.com');
      await user.click(submitButton);

      // ローディング状態の確認
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /create user/i });
        expect(button).toHaveAttribute('data-loading', 'true');
      });

      // フォームがクリアされることを確認
      await waitFor(() => {
        expect(nameInput).toHaveValue('');
        expect(emailInput).toHaveValue('');
      });

      // 新しいユーザーが一覧に表示される
      await waitFor(() => {
        expect(screen.getByText('New Test User')).toBeInTheDocument();
        expect(screen.getByText('newuser@example.com')).toBeInTheDocument();
      });
    });

    it('空のフォームは送信できない', async () => {
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /create user/i });

      // 入力が無効な場合は送信ボタンが disabled になる
      expect(submitButton).toBeDisabled();

      // required属性によりブラウザの検証が働くため、実際には送信されない
      // この動作はブラウザの機能なので、ここではフォームの検証属性を確認
      const nameInput = screen.getByPlaceholderText('Name');
      const emailInput = screen.getByPlaceholderText('Email');

      expect(nameInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('type', 'email');
    });
  });
});
