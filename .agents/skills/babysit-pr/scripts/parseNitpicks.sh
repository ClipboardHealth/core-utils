#!/usr/bin/env bash
# parseNitpicks.sh — Parse CodeRabbit nitpick comments from PR review bodies.
# Copied from plugins/core/skills/unresolved-pr-comments/scripts/parseNitpicks.sh
# with one addition: each emitted nitpick includes a stable `fingerprint` field
# (sha256 of file + normalized line range + title + body), so reposted reviews
# dedupe to the same fingerprint. Source review timestamps are kept as
# `createdAt` metadata but NOT included in the fingerprint.
#
# Sourced by unresolvedPrComments.sh. Requires: jq, perl, shasum.

extract_nitpick_comments() {
  local reviews_json="$1"

  printf '%s' "$reviews_json" | perl -e '
use strict;
use warnings;
use JSON::PP;
use Digest::SHA qw(sha256_hex);

local $/;
my $reviews_json = <STDIN>;
my $reviews = decode_json($reviews_json);

my $latest_review;
my $latest_time = "";
for my $review (@$reviews) {
  my $author = $review->{author}{login} // "";
  my $body = $review->{body} // "";
  next unless $author eq "coderabbitai" && $body =~ /Nitpick comments/;
  my $created = $review->{createdAt} // "";
  if ($created gt $latest_time) {
    $latest_time = $created;
    $latest_review = $review;
  }
}

unless ($latest_review) {
  print "[]";
  exit 0;
}

my $body = $latest_review->{body};
my $author = $latest_review->{author}{login} // "deleted-user";
my $created_at = $latest_review->{createdAt} // "";

my $nitpick_content = extract_nitpick_section($body);
unless (defined $nitpick_content) {
  print "[]";
  exit 0;
}

my @comments;
while ($nitpick_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
  my $file_name = trim($1);
  my $file_content = $2;

  while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
    my $line_range = $1;
    my $title = trim($2);
    my $clean_body = clean_comment_body(trim($3));

    # Fingerprint: file + normalized line + title + body (NO timestamp,
    # NO author — reposted reviews must dedupe to the same fingerprint).
    my $fingerprint_input = join("\n", $file_name, $line_range, $title, $clean_body);
    my $fingerprint = substr(sha256_hex($fingerprint_input), 0, 16);

    push @comments, {
      author      => $author,
      body        => "$title\n\n$clean_body",
      createdAt   => $created_at,
      file        => $file_name,
      fingerprint => $fingerprint,
      line        => $line_range,
      title       => $title,
    };
  }
}

print encode_json(\@comments);

sub extract_nitpick_section {
  my ($text) = @_;
  if ($text =~ /<summary>\x{1f9f9} Nitpick comments \(\d+\)<\/summary>\s*<blockquote>/i) {
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

    my $depth = 1;
    my @tags;
    while ($after =~ /(<blockquote>|<\/blockquote>)/gi) {
      my $tag = $1;
      my $pos = $-[0];
      my $is_open = ($tag =~ /^<blockquote>/i) ? 1 : 0;
      push @tags, [$pos, $is_open];
    }
    for my $tag (@tags) {
      $depth += $tag->[1] ? 1 : -1;
      if ($depth == 0) {
        return substr($after, 0, $tag->[0]);
      }
    }
  }
  return undef;
}

sub clean_comment_body {
  my ($text) = @_;
  my $prev = "";
  while ($text ne $prev) {
    $prev = $text;
    $text =~ s/<details>(?:(?!<details>)[\s\S])*?<\/details>//g;
  }
  $text =~ s/</&lt;/g;
  $text =~ s/>/&gt;/g;
  return trim($text);
}

sub trim {
  my ($s) = @_;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}
'
}

# Extract code scanning alert number from comment body.
extract_code_scanning_alert_number() {
  local body="$1"
  printf '%s' "$body" | perl -ne 'print $1 if m{/code-scanning/(\d+)}'
}
