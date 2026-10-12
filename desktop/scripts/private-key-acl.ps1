param([ValidateSet("Protect", "Verify")][string]$Mode = "Verify")
$ErrorActionPreference = "Stop"
$target = $env:AX_DESKTOP_PRIVATE_PATH
if ([string]::IsNullOrWhiteSpace($target)) { throw "Private key path is required" }
$item = Get-Item -LiteralPath $target -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "Private signing paths must not be reparse points"
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($Mode -eq "Protect") {
  if ($item.PSIsContainer) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $inheritance = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
  } else {
    $acl = [Security.AccessControl.FileSecurity]::new()
    $inheritance = [Security.AccessControl.InheritanceFlags]::None
  }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,
    [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $target -AclObject $acl
}
$acl = Get-Acl -LiteralPath $target
if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {
  throw "Private signing path must have a protected owner-only ACL"
}
$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$ownerAllowed = $false
foreach ($rule in $rules) {
  if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
    if ($rule.IdentityReference.Value -ne $sid.Value -or $rule.IsInherited) {
      throw "Private signing path grants access to another identity"
    }
    if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq
        [Security.AccessControl.FileSystemRights]::FullControl) { $ownerAllowed = $true }
  } else { throw "Unexpected deny rule on private signing path" }
}
if (-not $ownerAllowed) { throw "Private signing path does not grant its owner full control" }
