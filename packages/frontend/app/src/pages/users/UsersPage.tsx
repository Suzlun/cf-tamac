import type { UsersActions, UsersData } from '@cfreact-template-frontend/domain';
import { useUsers } from '@cfreact-template-frontend/domain';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Separator,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cfreact-template-frontend/ui';

function PageHeader() {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        User Directory
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Users</h1>
      <p className="text-muted-foreground">
        Create users, validate inputs, and view them in a responsive table.
      </p>
    </div>
  );
}

function CreateUserForm({ data, actions }: { data: UsersData; actions: UsersActions }) {
  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void actions.submit();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New User</CardTitle>
        <CardDescription>名前とメールアドレスを入力してユーザーを作成します</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  placeholder="Name"
                  value={data.form.name}
                  onChange={(event) => {
                    actions.updateName(event.target.value);
                  }}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="Email"
                  value={data.form.email}
                  onChange={(event) => {
                    actions.updateEmail(event.target.value);
                  }}
                  required
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                disabled={data.isSubmitting || !data.form.isValid}
                data-loading={data.isSubmitting ? 'true' : 'false'}
              >
                {data.isSubmitting && <Spinner className="mr-2" />}
                Create User
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={data.isSubmitting}
                onClick={() => {
                  actions.reload();
                }}
              >
                Refresh List
              </Button>
            </div>
            {data.isSubmitting && <Progress value={65} />}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function UsersTable({ data }: { data: UsersData }) {
  if (data.list.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center">
        <h2 className="text-lg font-semibold">No users found</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create one above to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.list.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.id}</TableCell>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.createdAt.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Users management page with list and creation form. */
function UsersPage() {
  const { data, actions } = useUsers();

  return (
    <div className="space-y-6">
      <PageHeader />
      <CreateUserForm data={data} actions={actions} />

      {data.isLoading && (
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>Loading users...</span>
          </div>
          <Progress value={45} />
        </div>
      )}

      {data.error != null && (
        <Alert variant="destructive">
          <AlertTitle>Error loading users</AlertTitle>
          {data.error.message}
        </Alert>
      )}

      {!data.isLoading && <UsersTable data={data} />}

      <Separator />
      <div className="text-sm text-muted-foreground">
        <p>Powered by Cloudflare Workers + Hono + Drizzle</p>
      </div>
    </div>
  );
}

export { UsersPage };
